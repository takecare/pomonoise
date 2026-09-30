const path = require('node:path');
const { app, BrowserWindow, Tray, Menu, Notification, nativeImage, nativeTheme, ipcMain } = require('electron');

// Noise must be able to start from the menubar without a click inside the window.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let win = null;
let tray = null;
let quitting = false;
let last = null; // most recent timer state reported by the renderer

function createWindow() {
  win = new BrowserWindow({
    width: 400,
    height: 640,
    title: 'Pomonoise',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1917' : '#fafaf9', // no white flash in dark mode
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      // Keep the timer and audio running while the window is hidden.
      backgroundThrottling: false,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  // Closing the window hides it; the app lives on in the menubar.
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
    }
  });
}

function showWindow() {
  if (!win) createWindow();
  win.show();
  win.focus();
}

function send(name, value) {
  win?.webContents.send('command', { name, value });
}

function formatTime(ms) {
  const total = Math.ceil(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function buildMenu() {
  const s = last;
  const template = [];
  if (s) {
    template.push(
      { label: `${s.label} — ${formatTime(s.remainingMs)}${s.status === 'paused' ? ' (paused)' : ''}`, enabled: false },
      { label: { idle: 'Start', running: 'Pause', paused: 'Resume' }[s.status], click: () => send('toggle') },
      { label: 'Skip', click: () => send('skip') },
      { label: 'Reset', click: () => send('reset') },
      { type: 'separator' },
      { label: 'Noise', type: 'checkbox', checked: s.noiseEnabled, click: (item) => send('noise', item.checked) },
      {
        label: 'Noise type',
        submenu: s.noiseTypes.map((t) => ({
          label: t[0].toUpperCase() + t.slice(1),
          type: 'radio',
          checked: t === s.noiseType,
          click: () => send('noiseType', t),
        })),
      },
      { type: 'separator' },
    );
  }
  template.push({ label: 'Show Pomonoise', click: showWindow }, { label: 'Quit', role: 'quit' });
  return Menu.buildFromTemplate(template);
}

function updateTray() {
  if (!tray) return;
  const s = last;
  // Title is the text shown next to the icon in the macOS menubar.
  tray.setTitle(s && s.status !== 'idle' ? `${s.status === 'paused' ? '⏸ ' : ''}${formatTime(s.remainingMs)}` : '');
  tray.setToolTip('Pomonoise');
  tray.setContextMenu(buildMenu());
}

app.whenReady().then(() => {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', '..', 'assets', 'trayTemplate.png'));
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  updateTray();
  createWindow();

  ipcMain.on('state', (_e, state) => {
    last = state;
    updateTray();
  });
  // The page's Theme setting: 'system' | 'light' | 'dark'. Making Electron follow it
  // keeps the window frame and prefers-color-scheme consistent with the page.
  ipcMain.on('theme', (_e, theme) => {
    if (['system', 'light', 'dark'].includes(theme)) nativeTheme.themeSource = theme;
  });
  ipcMain.on('notify', (_e, { title, body }) => {
    if (Notification.isSupported()) new Notification({ title, body, silent: true }).show();
  });
});

app.on('before-quit', () => { quitting = true; });
app.on('activate', showWindow);
// Stay running in the menubar when all windows are closed.
app.on('window-all-closed', () => {});
