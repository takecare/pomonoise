import { PomodoroTimer, DEFAULT_SETTINGS, formatTime } from './timer.js';
import { NoisePlayer } from './noise.js';
import { PRESET_NAMES, presetCurve, matchPreset, isValidCurve, GRID_FREQS } from './eq.js';
import { smoothSpectrum } from './spectrum.js';
import { fadeFactor, fadeInFactor } from './fade.js';
import { ChimePlayer } from './chime.js';
import { applyTheme, normalizeTheme } from './theme.js';
import { createEqEditor } from './eq-editor.js';

const PHASE_LABEL = { work: 'Focus', short: 'Short break', long: 'Long break' };
const $ = (id) => document.getElementById(id);

// In Electron the preload script provides window.pomonoise (tray + notifications).
// In a plain browser we fall back to the Web Notification API.
const bridge = window.pomonoise ?? {
  notify(title, body) {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'granted') new Notification(title, { body });
    else if (Notification.permission !== 'denied') Notification.requestPermission();
  },
  updateState() {},
  onCommand() {},
};

// ---- persisted preferences -------------------------------------------------

const PREFS_KEY = 'pomonoise.prefs';
const prefs = {
  ...DEFAULT_SETTINGS,
  noiseEnabled: false,
  noiseType: 'brown', // preset name, or 'custom'
  curve: null, // dB per band; null until first run (or for prefs saved by older versions)
  volume: 0.5,
  focusOnly: false,
  showSpectrum: true,
  theme: 'system', // 'system' | 'light' | 'dark'
  chimeOnStart: true, // chime when a focus session starts
  chimeOnEnd: true, // chime when a focus session ends
  fadeFocus: false, // fade the noise out over the end of a focus session
  fadeInBreak: false, // silent break; fade the noise in over the end of it
  fadeSeconds: 30, // how long the fades last
};
try {
  Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}'));
} catch {}
if (!isValidCurve(prefs.curve)) {
  prefs.curve = presetCurve(PRESET_NAMES.includes(prefs.noiseType) ? prefs.noiseType : 'brown');
}
prefs.noiseType = matchPreset(prefs.curve);
prefs.theme = applyTheme(document.documentElement, prefs.theme);
bridge.setTheme?.(prefs.theme); // Electron: make the window frame follow too
const savePrefs = () => {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {}
};

// ---- core objects ------------------------------------------------------------

const noise = new NoisePlayer();
const chime = new ChimePlayer();
noise.setCurve(prefs.curve);
noise.setVolume(prefs.volume);

const NOTIFICATIONS = {
  start: { work: 'Focus time', short: 'Short break', long: 'Long break' },
  end: {
    work: ['Pomodoro complete', 'Time for a break.'],
    short: ['Break over', 'Back to focus.'],
    long: ['Long break over', 'Back to focus.'],
  },
};

const timer = new PomodoroTimer(prefs, {
  emit(type, data) {
    if (type === 'change') render(data);
    else if (type === 'start') {
      if (data.phase === 'work' && prefs.chimeOnStart) chime.play('start').catch(() => {});
      const minutes = Math.round(timer.state.totalMs / 60000);
      bridge.notify(NOTIFICATIONS.start[data.phase], `${minutes} minutes`);
    } else if (type === 'end') {
      if (data.phase === 'work' && prefs.chimeOnEnd) chime.play('end').catch(() => {});
      bridge.notify(...NOTIFICATIONS.end[data.phase]);
    }
  },
});
setInterval(() => {
  timer.tick();
  applyFade(timer.state);
}, 250);

// ---- fades ----------------------------------------------------------------------

// Multiplier on the volume slider for the current moment. Focus can fade out over
// its last `fadeSeconds`; a break can be silent until its last `fadeSeconds` and
// then fade in. While paused or idle the level simply holds.
function noiseLevel(state) {
  const ms = prefs.fadeSeconds * 1000;
  if (state.phase === 'work') return prefs.fadeFocus ? fadeFactor(state.remainingMs, ms) : 1;
  return prefs.fadeInBreak ? fadeInFactor(state.remainingMs, ms) : 1;
}

function applyFade(state) {
  noise.setFade(noiseLevel(state));
}

// ---- noise policy ------------------------------------------------------------

function syncNoise(state) {
  // With "fade in at the end of a break" the break is silent until the fade
  // window opens, so the noise only runs once the level is above zero. This
  // takes precedence over "only play while focusing" so the fade can be heard.
  const fadingInBreak = state.phase !== 'work' && prefs.fadeInBreak;
  const active = prefs.noiseEnabled && (fadingInBreak
    ? noiseLevel(state) > 0
    : !prefs.focusOnly || (state.status === 'running' && state.phase === 'work'));
  if (active) noise.play().catch(() => {});
  else noise.stop();
}

function setNoiseEnabled(on) {
  prefs.noiseEnabled = on;
  savePrefs();
  render(timer.state);
}

// Apply a curve (from a preset or from dragging points). `fromEditor` means the
// editor already shows it.
function setCurve(curve, fromEditor = false) {
  prefs.curve = curve;
  prefs.noiseType = matchPreset(curve);
  noise.setCurve(curve);
  if (!fromEditor) editor.setCurve(curve);
  savePrefs();
  render(timer.state);
}

function setNoiseType(type) {
  if (PRESET_NAMES.includes(type)) setCurve(presetCurve(type));
}

// ---- rendering -----------------------------------------------------------------

function render(state) {
  document.body.dataset.phase = state.phase;
  $('phase').textContent = PHASE_LABEL[state.phase];
  $('time').textContent = formatTime(state.remainingMs);
  document.title = state.status === 'idle' ? 'Pomonoise' : `${formatTime(state.remainingMs)} · ${PHASE_LABEL[state.phase]}`;
  $('toggle').textContent = { idle: 'Start', running: 'Pause', paused: 'Resume' }[state.status];

  const dots = $('dots');
  const n = prefs.longBreakEvery;
  const done = state.completed % n;
  if (dots.children.length !== n) dots.replaceChildren(...Array.from({ length: n }, () => document.createElement('i')));
  [...dots.children].forEach((el, i) => el.classList.toggle('done', i < done));

  $('noise-toggle').textContent = prefs.noiseEnabled ? 'On' : 'Off';
  $('noise-toggle').setAttribute('aria-pressed', String(prefs.noiseEnabled));
  $('noise-type').value = prefs.noiseType;

  applyFade(state);
  syncNoise(state);
  bridge.updateState({
    ...state,
    label: PHASE_LABEL[state.phase],
    noiseEnabled: prefs.noiseEnabled,
    noiseType: prefs.noiseType,
    noiseTypes: PRESET_NAMES,
  });
}

// ---- wiring ------------------------------------------------------------------------

$('toggle').onclick = () => timer.toggle();
$('skip').onclick = () => timer.skip();
$('reset').onclick = () => timer.reset();
$('noise-toggle').onclick = () => setNoiseEnabled(!prefs.noiseEnabled);

const typeSelect = $('noise-type');
for (const t of [...PRESET_NAMES, 'custom']) typeSelect.add(new Option(t[0].toUpperCase() + t.slice(1), t));
typeSelect.onchange = () => setNoiseType(typeSelect.value);

const editor = createEqEditor($('eq'), {
  onChange: (curve) => setCurve(curve, true),
  onReadout: (text) => { $('eq-readout').textContent = text; },
});
editor.setCurve(prefs.curve);

$('show-spectrum').checked = prefs.showSpectrum;
$('show-spectrum').onchange = (e) => {
  prefs.showSpectrum = e.target.checked;
  savePrefs();
};

// Live spectrum of what is playing, drawn over the curve while the page is visible.
let spectrumShown = false;
(function frame() {
  requestAnimationFrame(frame);
  if (document.hidden) return;
  const show = prefs.showSpectrum && noise.playing;
  if (show) {
    const s = noise.readSpectrum();
    if (s) editor.setMeasured(smoothSpectrum(s.db, s.binHz, GRID_FREQS));
  } else if (spectrumShown) {
    editor.setMeasured(null);
  }
  spectrumShown = show;
})();

$('volume').value = prefs.volume;
$('volume').oninput = (e) => {
  prefs.volume = Number(e.target.value);
  noise.setVolume(prefs.volume);
  savePrefs();
};

$('focus-only').checked = prefs.focusOnly;
$('focus-only').onchange = (e) => {
  prefs.focusOnly = e.target.checked;
  savePrefs();
  render(timer.state);
};

for (const key of ['workMinutes', 'shortBreakMinutes', 'longBreakMinutes', 'longBreakEvery']) {
  const input = $(key);
  input.value = prefs[key];
  input.onchange = () => {
    const v = Math.max(Number(input.min), Math.min(Number(input.max), Math.round(Number(input.value)) || prefs[key]));
    input.value = v;
    prefs[key] = v;
    savePrefs();
    timer.updateSettings({ [key]: v });
  };
}
$('autoStartNext').checked = prefs.autoStartNext;
$('autoStartNext').onchange = (e) => {
  prefs.autoStartNext = e.target.checked;
  savePrefs();
  timer.updateSettings({ autoStartNext: prefs.autoStartNext });
};

$('theme').value = prefs.theme;
$('theme').onchange = (e) => {
  prefs.theme = applyTheme(document.documentElement, e.target.value);
  bridge.setTheme?.(prefs.theme);
  savePrefs();
};

for (const key of ['chimeOnStart', 'chimeOnEnd', 'fadeFocus', 'fadeInBreak']) {
  $(key).checked = prefs[key];
  $(key).onchange = (e) => {
    prefs[key] = e.target.checked;
    savePrefs();
    applyFade(timer.state);
  };
}
$('fadeSeconds').value = prefs.fadeSeconds;
$('fadeSeconds').onchange = (e) => {
  const v = Math.max(1, Math.min(300, Math.round(Number(e.target.value)) || prefs.fadeSeconds));
  e.target.value = v;
  prefs.fadeSeconds = v;
  savePrefs();
  applyFade(timer.state);
};
$('preview-start').onclick = () => chime.play('start').catch(() => {});
$('preview-end').onclick = () => chime.play('end').catch(() => {});

// Commands coming from the menubar item.
bridge.onCommand(({ name, value }) => {
  if (name === 'toggle') timer.toggle();
  else if (name === 'skip') timer.skip();
  else if (name === 'reset') timer.reset();
  else if (name === 'noise') setNoiseEnabled(value);
  else if (name === 'noiseType') setNoiseType(value);
});

render(timer.state);
