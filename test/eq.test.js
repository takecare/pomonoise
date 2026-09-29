import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BAND_FREQS, MAX_DB, PRESET_NAMES, presetCurve, matchPreset, solveFilterGains,
  cascadeResponseDb, compensationDb, curveResponseDb, logFreqs, formatFreq, isValidCurve,
} from '../src/renderer/eq.js';

const SR = 48000;

test('presets are centred on 0 dB and fit the editable range', () => {
  for (const name of PRESET_NAMES) {
    const c = presetCurve(name);
    assert.equal(c.length, BAND_FREQS.length);
    assert.ok(c.every((v) => Math.abs(v) <= MAX_DB), name);
    assert.ok(Math.abs(c.reduce((a, b) => a + b, 0) / c.length) < 0.2, `${name} mean`);
  }
  assert.ok(presetCurve('white').every((v) => v === 0));
});

test('preset slopes: pink falls 3 dB per octave, brown 6, blue rises 3', () => {
  const step = (name) => presetCurve(name)[6] - presetCurve(name)[5];
  assert.ok(Math.abs(step('pink') + 3) < 0.11);
  assert.ok(Math.abs(step('brown') + 6) < 0.11);
  assert.ok(Math.abs(step('blue') - 3) < 0.11);
});

test('matchPreset recognises presets and reports custom otherwise', () => {
  for (const name of PRESET_NAMES) assert.equal(matchPreset(presetCurve(name)), name);
  const c = presetCurve('pink');
  c[3] += 4;
  assert.equal(matchPreset(c), 'custom');
});

test('solved filters pass through the target points (for curves a smooth EQ can follow)', () => {
  const targets = [...PRESET_NAMES.map(presetCurve), [0, 0, 6, 12, 6, 0, -6, -12, -6, 0], [30, 20, 10, 0, -10, -20, -30, -30, -30, -30]];
  for (const t of targets) {
    const g = solveFilterGains(t, SR);
    BAND_FREQS.forEach((f, i) => {
      assert.ok(Math.abs(cascadeResponseDb(g, f, SR) - t[i]) < 0.5, `band ${i}: ${cascadeResponseDb(g, f, SR)} vs ${t[i]}`);
    });
  }
});

test('between the points the pink and brown responses stay close to the ideal slope', () => {
  for (const [name, slope, tol] of [['pink', -3, 0.5], ['brown', -6, 1]]) {
    const t = presetCurve(name);
    const g = solveFilterGains(t, SR);
    // Sample between band 1 and band 8, away from the shelf ends.
    for (let i = 1; i < 8; i++) {
      const mid = Math.sqrt(BAND_FREQS[i] * BAND_FREQS[i + 1]);
      const ideal = (t[i] + t[i + 1]) / 2;
      const got = cascadeResponseDb(g, mid, SR);
      assert.ok(Math.abs(got - ideal) < tol, `${name} @ ${Math.round(mid)}Hz: ${got.toFixed(2)} vs ${ideal.toFixed(2)}`);
    }
    assert.ok(slope < 0);
  }
});

test('compensation keeps every curve at the loudness of white noise', () => {
  assert.ok(Math.abs(compensationDb(new Array(10).fill(0), SR)) < 1e-9);
  const flatBoost = solveFilterGains(new Array(10).fill(6), SR);
  assert.ok(Math.abs(compensationDb(flatBoost, SR) + 6) < 1); // roughly -6 dB
  for (const name of PRESET_NAMES) {
    const g = solveFilterGains(presetCurve(name), SR);
    const comp = compensationDb(g, SR);
    // Recompute the power after compensation: must average to 1 (0 dB).
    let p = 0;
    for (let k = 0; k < 512; k++) p += 10 ** ((cascadeResponseDb(g, ((k + 0.5) / 512) * (SR / 2), SR) + comp) / 10);
    assert.ok(Math.abs(10 * Math.log10(p / 512)) < 1e-6, name);
  }
});

test('curveResponseDb samples the sounding curve at the given frequencies', () => {
  const f = logFreqs(5);
  assert.equal(curveResponseDb(presetCurve('pink'), f).length, 5);
  assert.ok(Math.abs(logFreqs(3, 20, 20000)[1] - 632.45) < 0.1);
});

test('helpers', () => {
  assert.equal(formatFreq(31.25), '31 Hz');
  assert.equal(formatFreq(1000), '1 kHz');
  assert.equal(formatFreq(16000), '16 kHz');
  assert.ok(isValidCurve(presetCurve('pink')));
  assert.ok(!isValidCurve([1, 2, 3]));
  assert.ok(!isValidCurve(presetCurve('pink').map(() => NaN)));
  assert.throws(() => presetCurve('green'));
});
