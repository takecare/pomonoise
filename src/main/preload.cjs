const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pomonoise', {
  notify: (title, body) => ipcRenderer.send('notify', { title, body }),
  setTheme: (theme) => ipcRenderer.send('theme', theme),
  updateState: (state) => ipcRenderer.send('state', state),
  onCommand: (cb) => ipcRenderer.on('command', (_e, cmd) => cb(cmd)),
});
