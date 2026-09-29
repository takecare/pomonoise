import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateNoise, NOISE_TYPES } from '../src/renderer/noise.js';

function rng(seed = 1) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const N = 48_000;
const rms = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);
// Rough spectral tilt: energy of the first difference relative to the signal.
const roughness = (a) => rms(a.slice(1).map((x, i) => x - a[i])) / rms(a);

for (const type of NOISE_TYPES) {
  test(`${type}: right length, in range, normalised loudness`, () => {
    const a = generateNoise(type, N, { random: rng() });
    assert.equal(a.length, N);
    assert.ok(a.every((x) => x >= -1 && x <= 1));
    assert.ok(Math.abs(rms(a) - 0.2) < 0.01);
  });

  test(`${type}: loop seam has no click`, () => {
    const a = generateNoise(type, N, { random: rng(7) });
    const seam = Math.abs(a[0] - a[N - 1]);
    assert.ok(seam < 6 * rms(a), `seam jump ${seam}`);
  });
}

test('colours order from dark to bright: brown < pink < white < blue < violet', () => {
  const r = Object.fromEntries(NOISE_TYPES.map((t) => [t, roughness(generateNoise(t, N, { random: rng(3) }))]));
  assert.ok(r.brown < r.pink && r.pink < r.white && r.white < r.blue && r.blue < r.violet, JSON.stringify(r));
});

test('unknown type throws', () => {
  assert.throws(() => generateNoise('green', 100), /Unknown noise type/);
});
