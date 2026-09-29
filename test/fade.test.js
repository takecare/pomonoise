import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fadeFactor } from '../src/renderer/fade.js';

test('full volume until the fade window opens', () => {
  assert.equal(fadeFactor(60_000, 30_000), 1);
  assert.equal(fadeFactor(30_000, 30_000), 1);
});

test('falls linearly to silence at the end', () => {
  assert.equal(fadeFactor(15_000, 30_000), 0.5);
  assert.equal(fadeFactor(3_000, 30_000), 0.1);
  assert.equal(fadeFactor(0, 30_000), 0);
});

test('is monotonic and stays within 0..1', () => {
  let prev = 1;
  for (let r = 40_000; r >= -1000; r -= 250) {
    const f = fadeFactor(r, 30_000);
    assert.ok(f >= 0 && f <= 1 && f <= prev);
    prev = f;
  }
});

test('a zero or invalid fade length disables the fade', () => {
  assert.equal(fadeFactor(0, 0), 1);
  assert.equal(fadeFactor(0, NaN), 1);
  assert.equal(fadeFactor(0, -5), 1);
});

test('the fade is even in perceived loudness: gain (slider^2) halves in level steps', () => {
  // Halfway through, the slider value is halved, so gain drops to a quarter (-12 dB).
  const g = fadeFactor(15_000, 30_000) ** 2;
  assert.equal(g, 0.25);
});
