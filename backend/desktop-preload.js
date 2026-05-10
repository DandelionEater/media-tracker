const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopUpdater', {
  onUpdateAvailable: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('updater:update-available', handler);
    return () => ipcRenderer.removeListener('updater:update-available', handler);
  },
  onUpdateDownloading: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('updater:downloading', handler);
    return () => ipcRenderer.removeListener('updater:downloading', handler);
  },
  onUpdateDownloaded: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('updater:update-downloaded', handler);
    return () => ipcRenderer.removeListener('updater:update-downloaded', handler);
  },
  onUpdateError: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('updater:error', handler);
    return () => ipcRenderer.removeListener('updater:error', handler);
  },
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  remindLater: () => ipcRenderer.invoke('updater:remind-later'),
});

contextBridge.exposeInMainWorld('desktopShortcuts', {
  getHideShowShortcut: () => ipcRenderer.invoke('shortcuts:get-hide-show'),
  setHideShowShortcut: (payload) => ipcRenderer.invoke('shortcuts:set-hide-show', payload),
});
