const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { setupTray } = require('./tray');
const { registerShortcuts, registerShortcutIpc } = require('./shortcuts');
const { registerStartupIpc } = require('./startup');
const { setupAutoUpdates, checkForUpdates, stopAutoUpdates } = require('./updater');

const APP_URL = process.env.SEENARY_APP_URL || 'https://web.seenary.app';
const APP_USER_MODEL_ID = 'app.seenary.desktop';
let mainWindow = null;

app.setAppUserModelId(APP_USER_MODEL_ID);

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

  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });

  return win;
}

app.whenReady().then(() => {
  const win = createWindow();
  mainWindow = win;

  setupTray(win, {
    onCheckForUpdates: app.isPackaged ? () => checkForUpdates(win, { manual: true }) : null,
  });
  registerShortcuts(win);
  registerShortcutIpc(() => mainWindow);
  registerStartupIpc();
  setupAutoUpdates(win);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const nextWin = createWindow();
      mainWindow = nextWin;
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
  mainWindow = null;

  if (process.platform !== 'darwin') {
    stopAutoUpdates();
    app.quit();
  }
});
