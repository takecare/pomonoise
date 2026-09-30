// Canvas widget: edit the noise curve by dragging ten coloured points, and
// watch the measured spectrum of what is actually playing on top of it.

import {
  BAND_FREQS, BAND_COUNT, MAX_DB, GRID_FREQS, MIN_HZ, MAX_HZ,
  curveResponseDb, clampDb, freqPosition, hueAt, formatFreq,
} from './eq.js';
import { alignDb } from './spectrum.js';

const MARGIN = { left: 34, right: 10, top: 10, bottom: 22 };
const STEP_DB = 0.5;
const HANDLE_R = 6;

const hsl = (pos, l = 50, a = 1) => `hsla(${hueAt(pos)}, 80%, ${l}%, ${a})`;
const fmtDb = (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`;

export function createEqEditor(canvas, { onChange = () => {}, onReadout = () => {} } = {}) {
  const ctx = canvas.getContext('2d');
  let curve = new Array(BAND_COUNT).fill(0); // what the user asked for
  let response = curveResponseDb(curve); // what will sound, at GRID_FREQS
  let measured = null; // live spectrum aligned to `response`, or null
  let selected = 5;
  let dragging = false;
  let width = 0;
  let height = 0;
  let queued = false;

  const plot = () => ({
    l: MARGIN.left,
    t: MARGIN.top,
    w: width - MARGIN.left - MARGIN.right,
    h: height - MARGIN.top - MARGIN.bottom,
  });
  const xOf = (f) => plot().l + freqPosition(f) * plot().w;
  const yOf = (db) => plot().t + (1 - (db + MAX_DB) / (2 * MAX_DB)) * plot().h;
  const dbAt = (y) => clampDb(((1 - (y - plot().t) / plot().h) * 2 - 1) * MAX_DB);

  // ---- drawing ---------------------------------------------------------------

  function colors() {
    const s = getComputedStyle(document.documentElement);
    const v = (name) => s.getPropertyValue(name).trim();
    return { fg: v('--fg'), muted: v('--muted'), border: v('--border'), card: v('--card') };
  }

  function draw() {
    queued = false;
    if (!width) return;
    const c = colors();
    const { l, t, w, h } = plot();
    ctx.clearRect(0, 0, width, height);
    ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';

    // grid + labels
    ctx.lineWidth = 1;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    for (let db = -MAX_DB; db <= MAX_DB; db += 10) {
      const y = Math.round(yOf(db)) + 0.5;
      ctx.strokeStyle = db === 0 ? c.muted : c.border;
      ctx.beginPath();
      ctx.moveTo(l, y);
      ctx.lineTo(l + w, y);
      ctx.stroke();
      ctx.fillStyle = c.muted;
      ctx.fillText(`${db > 0 ? '+' : ''}${db}`, l - 5, y);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const f of [50, 100, 500, 1000, 5000, 10000]) {
      const x = Math.round(xOf(f)) + 0.5;
      ctx.strokeStyle = c.border;
      ctx.beginPath();
      ctx.moveTo(x, t);
      ctx.lineTo(x, t + h);
      ctx.stroke();
      ctx.fillStyle = c.muted;
      ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x, t + h + 5);
    }

    const rainbow = ctx.createLinearGradient(l, 0, l + w, 0);
    for (let i = 0; i <= 10; i++) rainbow.addColorStop(i / 10, hsl(i / 10));

    // filled area between 0 dB and the curve
    const path = (values) => {
      ctx.beginPath();
      GRID_FREQS.forEach((f, i) => (i ? ctx.lineTo(xOf(f), yOf(values[i])) : ctx.moveTo(xOf(f), yOf(values[i]))));
    };
    ctx.save();
    ctx.beginPath();
    ctx.rect(l, t, w, h);
    ctx.clip();
    path(response);
    ctx.lineTo(xOf(MAX_HZ), yOf(0));
    ctx.lineTo(xOf(MIN_HZ), yOf(0));
    ctx.closePath();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = rainbow;
    ctx.fill();
    ctx.globalAlpha = 1;

    // live measured spectrum
    if (measured) {
      path(measured);
      ctx.strokeStyle = c.fg;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // the curve that will sound
    path(response);
    ctx.strokeStyle = rainbow;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();

    // handles, sitting on the sounding curve
    BAND_FREQS.forEach((f, i) => {
      const pos = freqPosition(f);
      const y = yOf(clampDb(soundingAt(i)));
      if (i === selected) {
        ctx.beginPath();
        ctx.arc(xOf(f), y, HANDLE_R + 4, 0, Math.PI * 2);
        ctx.strokeStyle = hsl(pos, 50, 0.5);
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(xOf(f), y, HANDLE_R, 0, Math.PI * 2);
      ctx.fillStyle = hsl(pos);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = c.card;
      ctx.stroke();
    });
  }

  // Level of the sounding curve at band i's centre (nearest grid point).
  function soundingAt(i) {
    const target = BAND_FREQS[i];
    let best = 0;
    for (let k = 1; k < GRID_FREQS.length; k++) {
      if (Math.abs(Math.log(GRID_FREQS[k] / target)) < Math.abs(Math.log(GRID_FREQS[best] / target))) best = k;
    }
    return response[best];
  }

  const requestDraw = () => {
    if (!queued) {
      queued = true;
      requestAnimationFrame(draw);
    }
  };

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    requestDraw();
  }

  // ---- editing -----------------------------------------------------------------

  function announce() {
    onReadout(`${formatFreq(BAND_FREQS[selected])}: ${fmtDb(curve[selected])}`);
  }

  function commit() {
    response = curveResponseDb(curve);
    announce();
    requestDraw();
    onChange(curve.slice());
  }

  function setBand(i, db) {
    const v = clampDb(Math.round(db / STEP_DB) * STEP_DB);
    if (v === curve[i]) return;
    curve[i] = v;
    commit();
  }

  function nearestBand(x) {
    let best = 0;
    for (let i = 1; i < BAND_COUNT; i++) {
      if (Math.abs(xOf(BAND_FREQS[i]) - x) < Math.abs(xOf(BAND_FREQS[best]) - x)) best = i;
    }
    return best;
  }

  const localPoint = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  canvas.addEventListener('pointerdown', (e) => {
    const p = localPoint(e);
    selected = nearestBand(p.x);
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
    canvas.focus();
    announce();
    setBand(selected, dbAt(p.y));
    requestDraw();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (dragging) setBand(selected, dbAt(localPoint(e).y));
  });
  const endDrag = () => { dragging = false; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('dblclick', (e) => {
    setBand(nearestBand(localPoint(e).x), 0);
  });

  canvas.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 5 : 1;
    const moves = {
      ArrowLeft: () => (selected = Math.max(0, selected - 1)),
      ArrowRight: () => (selected = Math.min(BAND_COUNT - 1, selected + 1)),
      ArrowUp: () => setBand(selected, curve[selected] + step),
      ArrowDown: () => setBand(selected, curve[selected] - step),
      Home: () => setBand(selected, 0),
    };
    if (!moves[e.key]) return;
    e.preventDefault();
    moves[e.key]();
    announce();
    requestDraw();
  });
  canvas.addEventListener('focus', requestDraw);

  new ResizeObserver(resize).observe(canvas);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', requestDraw);
  new MutationObserver(requestDraw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  resize();

  return {
    // Replace the whole curve (e.g. a preset). Does not call onChange.
    setCurve(next) {
      curve = next.slice();
      response = curveResponseDb(curve);
      requestDraw();
    },
    // Raw measured dB at GRID_FREQS, or null to hide. Shape only: it is aligned
    // to the sounding curve because absolute FFT levels are not meaningful here.
    setMeasured(raw) {
      measured = raw ? alignDb(raw, response) : null;
      requestDraw();
    },
  };
}
