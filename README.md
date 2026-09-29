# Pomonoise

A pomodoro timer with a built-in noise generator, living in your macOS menubar.
Inspired by [Tomighty](https://github.com/tomighty/tomighty) and
[HSL-Noise](https://github.com/MitPitt/HSL-Noise).

- Pomodoro / short break / long break cycle (configurable, long break every N pomodoros)
- White, pink, brown, blue and violet noise, generated live with Web Audio
- Menubar item showing the countdown, with a menu to start/pause/skip/reset and control the noise
- System notifications when a phase starts or ends
- Optionally play noise only while focusing

## Web version

The UI also runs as a plain web app (no menubar; notifications use the browser's
Notification API). It is deployed to GitHub Pages from `main` at
https://takecare.github.io/pomonoise/.

## Run

```sh
npm install
npm start        # Electron app (menubar + notifications)
npm run web      # same UI in a browser at http://localhost:5173 (no menubar)
npm test         # unit tests for the timer and noise generator
npm run dist     # build a .app / .dmg with electron-builder (on a Mac)
```

## Layout

- `src/renderer/timer.js` – pure timer state machine (injected clock, unit-tested)
- `src/renderer/noise.js` – noise generators + Web Audio player
- `src/renderer/app.js` – UI wiring, preferences, noise policy
- `src/main/main.cjs` – Electron main process: window, tray, notifications
- `src/main/preload.cjs` – small IPC bridge (`window.pomonoise`)

The renderer owns the timer and audio; the main process is a thin view that
shows state in the tray and sends commands back when menu items are clicked.
