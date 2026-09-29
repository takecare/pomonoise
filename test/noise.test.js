import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWhiteNoise } from '../src/renderer/noise.js';

function rng(seed = 1) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const N = 48_000;
const rms = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);

test('white noise: right length, in range, normalised loudness', () => {
  const a = generateWhiteNoise(N, { random: rng() });
  assert.equal(a.length, N);
  assert.ok(a.every((x) => x >= -1 && x <= 1));
  assert.ok(Math.abs(rms(a) - 0.2) < 0.01);
});

test('white noise: loop seam has no click', () => {
  const a = generateWhiteNoise(N, { random: rng(7) });
  assert.ok(Math.abs(a[0] - a[N - 1]) < 6 * rms(a));
});

test('white noise is spectrally flat: first difference is as loud as sqrt(2) x the signal', () => {
  const a = generateWhiteNoise(N, { random: rng(3) });
  const diff = a.slice(1).map((x, i) => x - a[i]);
  assert.ok(Math.abs(rms(diff) / rms(a) - Math.SQRT2) < 0.05);
});
