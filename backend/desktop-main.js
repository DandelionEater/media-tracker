const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { setupBundledFrontend } = require('./bundledFrontend');
const { setupTray } = require('./tray');
const {
  getGamingModeEnabled,
  registerShortcuts,
  registerShortcutIpc,
  setGamingModeEnabled,
} = require('./shortcuts');
const { registerStartupIpc } = require('./startup');
const {
  setupAutoUpdates,
  checkForUpdates,
  isAutoUpdateAvailable,
  stopAutoUpdates,
} = require('./updater');
const { registerSystemLocaleIpc } = require('./systemLocale');
const { registerAppLifecycleIpc } = require('./appLifecycle');
const { registerLayoutConfigIpc } = require('./layoutConfig');
const {
  getDesktopEnvironmentInfo,
  registerDesktopEnvironmentIpc,
} = require('./desktopEnvironment');
const {
  attachWindowState,
  getInitialWindowOptions,
  registerWindowStateIpc,
} = require('./windowState');

const APP_URL = process.env.SEENARY_APP_URL || 'https://web.seenary.app';
const APP_USER_MODEL_ID = 'app.seenary.desktop';
let mainWindow = null;

app.setAppUserModelId(APP_USER_MODEL_ID);
app.setName('Seenary');

const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
  app.quit();
  return;
}

app.on('second-instance', () => {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
});

registerSystemLocaleIpc();
registerDesktopEnvironmentIpc();

function getTrayOptions(win) {
  return {
    isGamingModeEnabled: getGamingModeEnabled,
    onToggleGamingMode: (enabled) => setGamingModeEnabled(win, enabled),
    onCheckForUpdates:
      app.isPackaged && isAutoUpdateAvailable()
        ? () => checkForUpdates(win, { manual: true })
        : null,
  };
}

function createWindow() {
  const initialWindowOptions = getInitialWindowOptions();
  const win = new BrowserWindow({
    ...initialWindowOptions,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: true,
    hasShadow: true,
    icon: path.join(__dirname, process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'desktop-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  attachWindowState(win);

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

app.whenReady().then(async () => {
  const bundledFrontend = await setupBundledFrontend();
  console.log('Seenary desktop frontend:', bundledFrontend);
  console.log('Seenary desktop environment:', getDesktopEnvironmentInfo());

  registerAppLifecycleIpc();
  const win = createWindow();
  mainWindow = win;

  setupTray(win, getTrayOptions(win));
  registerShortcuts(win);
  registerShortcutIpc(() => mainWindow);
  registerStartupIpc();
  registerWindowStateIpc(() => mainWindow);
  registerLayoutConfigIpc();
  setupAutoUpdates(win);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const nextWin = createWindow();
      mainWindow = nextWin;
      setupTray(nextWin, getTrayOptions(nextWin));
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
