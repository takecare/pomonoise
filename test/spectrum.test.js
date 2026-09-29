import { test } from 'node:test';
import assert from 'node:assert/strict';
import { smoothSpectrum, alignDb } from '../src/renderer/spectrum.js';
import { logFreqs } from '../src/renderer/eq.js';

const BIN_HZ = 48000 / 8192;
const N = 4096;

test('a flat spectrum stays flat after smoothing', () => {
  const out = smoothSpectrum(new Float32Array(N).fill(-40), BIN_HZ, logFreqs(50));
  assert.ok(out.every((v) => Math.abs(v + 40) < 1e-9));
});

test('smoothing averages power, not dB', () => {
  // Two bins at 0 dB and one at -inf-ish: power average is well above the dB average.
  const bins = new Float32Array(N).fill(-100);
  const centre = 100;
  bins[centre] = 0;
  const [v] = smoothSpectrum(bins, BIN_HZ, [centre * BIN_HZ], 1 / 3);
  assert.ok(v > -100 && v < 0);
});

test('a -3 dB/octave tilt is recovered', () => {
  const bins = Float32Array.from({ length: N }, (_, i) => -3 * Math.log2(Math.max(i, 1) * BIN_HZ / 1000) - 50);
  const [a, b] = smoothSpectrum(bins, BIN_HZ, [500, 1000], 1 / 6);
  assert.ok(Math.abs(a - b - 3) < 0.3, `${a - b}`);
});

test('handles silence (-Infinity) without NaN', () => {
  const out = smoothSpectrum(new Float32Array(N).fill(-Infinity), BIN_HZ, logFreqs(10));
  assert.ok(out.every(Number.isFinite));
});

test('alignDb matches averages but keeps shape', () => {
  // shift = mean([0,5,10] - [-60,-50,-40]) = 55
  assert.deepEqual(alignDb([-60, -50, -40], [0, 5, 10]), [-5, 5, 15]);
});
