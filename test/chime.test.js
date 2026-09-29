import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chimeNotes, chimeDuration, CHIME_KINDS } from '../src/renderer/chime.js';

test('there is a start and an end chime', () => {
  assert.deepEqual([...CHIME_KINDS].sort(), ['end', 'start']);
});

test('start rises, end falls', () => {
  const rising = chimeNotes('start').map((n) => n.freq);
  const falling = chimeNotes('end').map((n) => n.freq);
  assert.deepEqual(rising, [...rising].sort((a, b) => a - b));
  assert.deepEqual(falling, [...falling].sort((a, b) => b - a));
});

test('notes are in order, audible-range and finite', () => {
  for (const kind of CHIME_KINDS) {
    const notes = chimeNotes(kind);
    notes.forEach((n, i) => {
      assert.ok(n.freq > 200 && n.freq < 2000);
      assert.ok(n.decay > 0 && n.at >= 0);
      if (i) assert.ok(n.at > notes[i - 1].at);
    });
  }
});

test('the end chime is longer than the start chime, and both are short', () => {
  assert.ok(chimeDuration('end') > chimeDuration('start'));
  assert.ok(chimeDuration('end') < 4);
});

test('callers cannot mutate the definitions', () => {
  chimeNotes('start')[0].freq = 1;
  assert.notEqual(chimeNotes('start')[0].freq, 1);
});

test('unknown chime throws', () => {
  assert.throws(() => chimeNotes('bell'), /Unknown chime/);
});
