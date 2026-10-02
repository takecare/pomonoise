// Full-page background visualiser (web version): the spectrum of what is playing,
// drawn as soft filled mountains behind the controls, in the same frequency
// colours as the curve editor. The maths is pure (unit-tested); createBackdrop()
// does the canvas drawing.

import { smoothSpectrum } from './spectrum.js';
import { logFreqs, freqPosition, hueAt } from './eq.js';

export const BACKDROP_FREQS = logFreqs(96, 30, 16000);

// Per-bin level (dB) of flat white noise at the app's loudness, as the Web Audio
// analyser reports it with the app's settings (FFT size 8192, time smoothing 0.85).
// Measured in Chromium: -62.3 dB, about 4 dB under the textbook figure of -58.3
// (the analyser averages magnitudes over time, and some constants differ).
// Everything else is drawn relative to it, so flat noise sits mid-height and a
// 30 dB boost reaches the top.
export const WHITE_DB = -62.3;
const BELOW_WHITE_DB = 35;
const RANGE_DB = 65;

const clamp01 = (v) => Math.min(1, Math.max(0, v));

// FFT bins (dB) -> 0..1 bar heights at `freqs`.
export function levelsFromSpectrum(dbBins, binHz, freqs = BACKDROP_FREQS) {
  return smoothSpectrum(dbBins, binHz, freqs, 1 / 3).map((db) => clamp01((db - (WHITE_DB - BELOW_WHITE_DB)) / RANGE_DB));
}

// Move each value towards its target, quickly when rising (`attack`) and slowly
// when falling (`release`), per frame. Returns a new array.
export function follow(current, target, attack, release) {
  return current.map((v, i) => v + (target[i] - v) * (target[i] > v ? attack : release));
}

// ---- drawing -------------------------------------------------------------------

const EPS = 0.004; // below this a bar is invisible: stop redrawing
const MAX_HEIGHT = 0.62; // fraction of the viewport the tallest bar reaches
const LAYERS = [
  { attack: 0.05, release: 0.02, alpha: { light: 0.16, dark: 0.22 }, line: false }, // slow afterglow
  { attack: 0.4, release: 0.1, alpha: { light: 0.26, dark: 0.38 }, line: true }, // follows the sound
];

export function createBackdrop(canvas, freqs = BACKDROP_FREQS) {
  const ctx = canvas.getContext('2d');
  const zeros = new Array(freqs.length).fill(0);
  const values = LAYERS.map(() => zeros.slice());
  let w = 0;
  let h = 0;
  let dark = false;
  let dirty = true;
  let wasActive = false;
  let gradient = null;

  function readTheme() {
    dark = getComputedStyle(document.documentElement).colorScheme === 'dark';
    dirty = true;
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    w = r.width;
    h = r.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    gradient = ctx.createLinearGradient(0, 0, w, 0);
    freqs.forEach((f, i) => gradient.addColorStop(i / (freqs.length - 1), `hsl(${hueAt(freqPosition(f))} 80% 55%)`));
    dirty = true;
  }

  function trace(vals) {
    const pts = vals.map((v, i) => [(i / (vals.length - 1)) * w, h - v * h * MAX_HEIGHT]);
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2;
      const my = (pts[i][1] + pts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my); // smooth through the midpoints
    }
    ctx.lineTo(pts.at(-1)[0], pts.at(-1)[1]);
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    LAYERS.forEach((layer, k) => {
      trace(values[k]);
      ctx.save();
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.globalAlpha = layer.alpha[dark ? 'dark' : 'light'];
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.restore();
      if (layer.line) {
        trace(values[k]);
        ctx.globalAlpha = dark ? 0.7 : 0.55;
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    });
  }

  new ResizeObserver(resize).observe(canvas);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readTheme);
  new MutationObserver(readTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  readTheme();
  resize();

  return {
    // Call once per animation frame. `target` is 0..1 heights at BACKDROP_FREQS (or
    // null for silence) and `scale` multiplies it (volume, fades). When everything
    // has faded to nothing it clears once and then does no work until sound returns.
    update(target, scale = 1) {
      const t = target ? target.map((v) => v * scale) : zeros;
      LAYERS.forEach((layer, k) => { values[k] = follow(values[k], t, layer.attack, layer.release); });
      const active = values.some((vals) => vals.some((v) => v > EPS));
      if (active) {
        draw();
      } else if (wasActive || dirty) {
        // Faded out: wipe the canvas (no leftover sliver) and snap to silence.
        values.forEach((vals) => vals.fill(0));
        ctx.clearRect(0, 0, w, h);
      }
      dirty = false;
      wasActive = active;
    },
    clear() {
      values.forEach((vals) => vals.fill(0));
      wasActive = false;
      ctx.clearRect(0, 0, w, h);
    },
  };
}
