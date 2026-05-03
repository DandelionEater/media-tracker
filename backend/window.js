const { app, BrowserWindow, globalShortcut } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,

    minWidth: 900,
    minHeight: 600,

    frame: false,
    transparent: true,
    backgroundColor: '#00000000',

    resizable: true,
    hasShadow: true,

    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (app.isPackaged) {
    win.loadFile(path.join(__dirname, 'frontend-dist', 'index.html'));
  } else {
    win.loadURL(process.env.ELECTRON_RENDERER_URL || 'http://localhost:5173');
  }

  // DevTools shortcut (CTRL+SHIFT+I)
  globalShortcut.register('CommandOrControl+Shift+I', () => {
    if (win) {
      win.webContents.toggleDevTools();
    }
  });

  return win;
}

module.exports = { createWindow };
