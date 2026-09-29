// The noise "curve": a target level (dB, relative to white noise) at ten
// octave-spaced frequencies, realised by a chain of biquad filters.
//
// Everything here is pure maths (no Web Audio), so it can be unit-tested in
// Node. The formulas are the ones the Web Audio spec uses for its BiquadFilter,
// so the response computed here is what the browser actually plays.

export const BAND_FREQS = Array.from({ length: 10 }, (_, i) => 31.25 * 2 ** i); // 31 Hz .. 16 kHz
export const BAND_COUNT = BAND_FREQS.length;
export const MAX_DB = 30; // each band can go from -MAX_DB to +MAX_DB
export const PEAK_Q = 0.8; // ~1.7 octaves wide: smooth blending, so slopes come out straight
export const MIN_HZ = 20;
export const MAX_HZ = 20000;

const FILTER_LIMIT_DB = 60;
const DEFAULT_SR = 48000;

// ---- presets: the classic noise colours are just spectral slopes -----------

export const PRESET_SLOPES = { white: 0, pink: -3, brown: -6, blue: 3, violet: 6 }; // dB per octave
export const PRESET_NAMES = Object.keys(PRESET_SLOPES);

const LOG_MEAN = BAND_FREQS.reduce((s, f) => s + Math.log2(f), 0) / BAND_COUNT;
const round1 = (x) => Math.round(x * 10) / 10 + 0; // "+ 0" turns -0 into 0

export function presetCurve(name) {
  const slope = PRESET_SLOPES[name];
  if (slope === undefined) throw new Error(`Unknown preset: ${name}`);
  return BAND_FREQS.map((f) => round1(slope * (Math.log2(f) - LOG_MEAN)));
}

// Name of the preset the curve matches, or 'custom'.
export function matchPreset(curve, tolerance = 0.25) {
  for (const name of PRESET_NAMES) {
    const p = presetCurve(name);
    if (p.every((v, i) => Math.abs(v - curve[i]) <= tolerance)) return name;
  }
  return 'custom';
}

export function isValidCurve(curve) {
  return Array.isArray(curve) && curve.length === BAND_COUNT && curve.every((v) => Number.isFinite(v));
}

export function clampDb(v) {
  return Math.max(-MAX_DB, Math.min(MAX_DB, v));
}

// ---- biquad maths (RBJ cookbook, as in the Web Audio spec) --------------------

// All ten bands are peaking filters. Shelving filters at the ends would hold
// their gain down to 0 Hz, piling inaudible sub-bass energy into a steep curve
// (and, once loudness is compensated, making the audible part too quiet).
function coefficients(freq, gainDb, sr) {
  const A = 10 ** (gainDb / 40);
  const w0 = (2 * Math.PI * freq) / sr;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * PEAK_Q);
  return [1 + alpha * A, -2 * cos, 1 - alpha * A, 1 + alpha / A, -2 * cos, 1 - alpha / A];
}

function magnitudeDb([b0, b1, b2, a0, a1, a2], freq, sr) {
  const w = (2 * Math.PI * freq) / sr;
  const c1 = Math.cos(w), s1 = -Math.sin(w);
  const c2 = Math.cos(2 * w), s2 = -Math.sin(2 * w);
  const nr = b0 + b1 * c1 + b2 * c2, ni = b1 * s1 + b2 * s2;
  const dr = a0 + a1 * c1 + a2 * c2, di = a1 * s1 + a2 * s2;
  return 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di));
}

function bandResponseDb(i, gainDb, freq, sr) {
  return magnitudeDb(coefficients(BAND_FREQS[i], gainDb, sr), freq, sr);
}

// Total response (dB) of the whole cascade at `freq`. Cascaded filters multiply,
// so their dB responses add.
export function cascadeResponseDb(filterGains, freq, sr = DEFAULT_SR) {
  let total = 0;
  for (let i = 0; i < BAND_COUNT; i++) total += bandResponseDb(i, filterGains[i], freq, sr);
  return total;
}

// Filter gains such that the cascade's response passes through `targetDb` at
// each band centre. Adjacent bands overlap, so setting each filter's gain to
// its own target would overshoot; instead iterate until the points line up.
export function solveFilterGains(targetDb, sr = DEFAULT_SR) {
  const g = targetDb.slice();
  for (let iter = 0; iter < 60; iter++) {
    let worst = 0;
    for (let i = 0; i < BAND_COUNT; i++) {
      const err = targetDb[i] - cascadeResponseDb(g, BAND_FREQS[i], sr);
      g[i] = Math.max(-FILTER_LIMIT_DB, Math.min(FILTER_LIMIT_DB, g[i] + err));
      worst = Math.max(worst, Math.abs(err));
    }
    if (worst < 0.01) break;
  }
  return g;
}

// dB to apply after the filters so any curve plays at the same overall level
// as flat white noise (whose power is spread evenly over 0..Nyquist).
export function compensationDb(filterGains, sr = DEFAULT_SR) {
  const N = 512;
  let power = 0;
  for (let k = 0; k < N; k++) power += 10 ** (cascadeResponseDb(filterGains, ((k + 0.5) / N) * (sr / 2), sr) / 10);
  return -10 * Math.log10(power / N);
}

// ---- helpers for drawing ----------------------------------------------------------

export function logFreqs(n, lo = MIN_HZ, hi = MAX_HZ) {
  return Array.from({ length: n }, (_, i) => lo * (hi / lo) ** (i / (n - 1)));
}
export const GRID_FREQS = logFreqs(240);

// The curve as it will actually sound, sampled at `freqs`.
export function curveResponseDb(targetDb, freqs = GRID_FREQS, sr = DEFAULT_SR) {
  const g = solveFilterGains(targetDb, sr);
  return freqs.map((f) => cascadeResponseDb(g, f, sr));
}

// Position 0..1 along the log-frequency axis.
export function freqPosition(f) {
  return Math.log(f / MIN_HZ) / Math.log(MAX_HZ / MIN_HZ);
}

// Colour for a frequency: low = red through to violet = high.
export function hueAt(position) {
  return Math.round(280 * Math.min(1, Math.max(0, position)));
}

export function formatFreq(f) {
  return f >= 1000 ? `${+(f / 1000).toFixed(2)} kHz` : `${Math.round(f)} Hz`;
}
