const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { setupTray } = require('./tray');
const { registerShortcuts } = require('./shortcuts');
const { setupAutoUpdates, checkForUpdates, stopAutoUpdates } = require('./updater');

const APP_URL = process.env.SEENARY_APP_URL || 'https://web.seenary.app';

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
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'desktop-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setMenuBarVisibility(false);
  win.loadURL(APP_URL);

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  return win;
}

app.whenReady().then(() => {
  const win = createWindow();

  setupTray(win, {
    onCheckForUpdates: app.isPackaged ? () => checkForUpdates(win, { manual: true }) : null,
  });
  registerShortcuts(win);
  setupAutoUpdates(win);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const nextWin = createWindow();
      setupTray(nextWin, {
        onCheckForUpdates: app.isPackaged
          ? () => checkForUpdates(nextWin, { manual: true })
          : null,
      });
      registerShortcuts(nextWin);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopAutoUpdates();
    app.quit();
  }
});
