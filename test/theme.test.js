import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, normalizeTheme, applyTheme } from '../src/renderer/theme.js';

const fakeRoot = () => ({
  attrs: {},
  setAttribute(k, v) { this.attrs[k] = v; },
  removeAttribute(k) { delete this.attrs[k]; },
});

test('themes are system, light and dark', () => {
  assert.deepEqual(THEMES, ['system', 'light', 'dark']);
});

test('unknown values fall back to system', () => {
  for (const v of [undefined, null, '', 'sepia', 42]) assert.equal(normalizeTheme(v), 'system');
  for (const v of THEMES) assert.equal(normalizeTheme(v), v);
});

test('light and dark force data-theme; system removes it', () => {
  const root = fakeRoot();
  assert.equal(applyTheme(root, 'dark'), 'dark');
  assert.equal(root.attrs['data-theme'], 'dark');
  assert.equal(applyTheme(root, 'light'), 'light');
  assert.equal(root.attrs['data-theme'], 'light');
  assert.equal(applyTheme(root, 'system'), 'system');
  assert.ok(!('data-theme' in root.attrs));
});

test('an invalid theme is treated as system', () => {
  const root = fakeRoot();
  root.setAttribute('data-theme', 'dark');
  assert.equal(applyTheme(root, 'nope'), 'system');
  assert.ok(!('data-theme' in root.attrs));
});
