import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levelsFromSpectrum, follow, WHITE_DB, BACKDROP_FREQS } from '../src/renderer/backdrop.js';

const BIN_HZ = 48000 / 8192;
const bins = (db) => new Float32Array(4096).fill(db);

test('flat white noise sits about mid-height', () => {
  const v = levelsFromSpectrum(bins(WHITE_DB), BIN_HZ);
  assert.equal(v.length, BACKDROP_FREQS.length);
  assert.ok(v.every((x) => Math.abs(x - 35 / 65) < 0.01), `${v[0]} .. ${v.at(-1)}`);
});

test('+30 dB reaches the top, 35 dB below white is the floor, and values are clamped', () => {
  assert.ok(levelsFromSpectrum(bins(WHITE_DB + 30), BIN_HZ).every((x) => x > 0.99));
  assert.ok(levelsFromSpectrum(bins(WHITE_DB - 35), BIN_HZ).every((x) => x < 0.01));
  assert.ok(levelsFromSpectrum(bins(0), BIN_HZ).every((x) => x === 1));
  assert.ok(levelsFromSpectrum(bins(-Infinity), BIN_HZ).every((x) => x === 0));
});

test('a tilted spectrum is drawn tilted: louder lows give taller bars on the left', () => {
  const tilt = Float32Array.from({ length: 4096 }, (_, i) => WHITE_DB - 6 * Math.log2(Math.max(i, 1) * BIN_HZ / 1000));
  const v = levelsFromSpectrum(tilt, BIN_HZ);
  assert.ok(v[10] > v[48] && v[48] > v[90], `${v[10]} ${v[48]} ${v[90]}`);
});

test('follow rises fast and falls slowly', () => {
  assert.deepEqual(follow([0], [1], 0.5, 0.1), [0.5]);
  assert.deepEqual(follow([1], [0], 0.5, 0.1), [0.9]);
});

test('follow converges on the target and never overshoots', () => {
  let v = [0, 1];
  for (let i = 0; i < 200; i++) {
    v = follow(v, [0.6, 0.2], 0.4, 0.1);
    assert.ok(v[0] <= 0.6 + 1e-12 && v[1] >= 0.2 - 1e-12);
  }
  assert.ok(Math.abs(v[0] - 0.6) < 1e-6 && Math.abs(v[1] - 0.2) < 1e-6);
});

test('follow fades fully to silence', () => {
  let v = [1, 1, 1];
  for (let i = 0; i < 400; i++) v = follow(v, [0, 0, 0], 0.4, 0.1);
  assert.ok(v.every((x) => x < 0.004));
});
