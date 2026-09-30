// Runs before first paint (a plain, non-module script in <head>) so a saved
// light/dark override does not flash the wrong theme. The full logic is in
// theme.js; this only reads the saved preference. Key matches PREFS_KEY in app.js.
try {
  const theme = JSON.parse(localStorage.getItem('pomonoise.prefs') || '{}').theme;
  if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme);
} catch {}
