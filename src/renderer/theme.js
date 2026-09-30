// Theme handling. "system" follows the OS; "light" and "dark" force a theme by
// setting data-theme on <html> (see style.css).

export const THEMES = ['system', 'light', 'dark'];

export function normalizeTheme(value) {
  return THEMES.includes(value) ? value : 'system';
}

// `root` is the <html> element (anything with set/removeAttribute works).
export function applyTheme(root, theme) {
  const t = normalizeTheme(theme);
  if (t === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);
  return t;
}
