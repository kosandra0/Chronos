'use strict';
/**
 * Minimal, explicit bridge between the WatchTower UI and the desktop host.
 * Only these named calls are exposed; the renderer has no Node.js access (contextIsolation + sandbox).
 */
const { contextBridge, ipcRenderer } = require('electron');

const listen = (channel, cb) => {
  const handler = (_event, ...args) => cb(...args);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('watchtower', {
  platform: process.platform,
  minimize: () => ipcRenderer.send('wt:minimize'),
  toggleMaximize: () => ipcRenderer.send('wt:toggle-maximize'),
  close: () => ipcRenderer.send('wt:close'),
  isMaximized: () => ipcRenderer.invoke('wt:is-maximized'),
  onMaximized: (cb) => listen('wt:maximized', cb),
  resizeStart: (dir) => ipcRenderer.send('wt:resize-start', String(dir)),
  resizeEnd: () => ipcRenderer.send('wt:resize-end'),
  showInFolder: (p) => ipcRenderer.send('wt:show-in-folder', String(p)),
  applyShell: (prefs) => ipcRenderer.send('wt:apply-shell', prefs),
  onDownload: (cb) => listen('wt:download', cb),
  onNavigate: (cb) => listen('wt:navigate', cb),
  openMain: (p) => ipcRenderer.send('wt:open-main', typeof p === 'string' ? p : '/'),
  trayClose: () => ipcRenderer.send('wt:tray-close'),
  quit: () => ipcRenderer.send('wt:quit'),
  setLogo: (id) => ipcRenderer.send('wt:set-logo', String(id)),
});
