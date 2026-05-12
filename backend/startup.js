const { app, ipcMain } = require('electron');

function getLoginItemOptions() {
  if (process.platform === 'win32') {
    return { path: process.execPath };
  }

  return {};
}

function getStartupSetting() {
  if (!app.isPackaged) {
    return {
      ok: true,
      available: false,
      openAtLogin: false,
      message: 'Launch at login is available after installing Seenary.',
    };
  }

  try {
    const settings = app.getLoginItemSettings(getLoginItemOptions());

    return {
      ok: true,
      available: true,
      openAtLogin: Boolean(settings.openAtLogin),
      wasOpenedAtLogin: Boolean(settings.wasOpenedAtLogin),
    };
  } catch (error) {
    return {
      ok: false,
      available: true,
      openAtLogin: false,
      message: error.message || 'Failed to read startup setting.',
    };
  }
}

function setStartupSetting(enabled) {
  if (!app.isPackaged) {
    return {
      ok: false,
      available: false,
      openAtLogin: false,
      message: 'Launch at login is available after installing Seenary.',
    };
  }

  try {
    app.setLoginItemSettings({
      ...getLoginItemOptions(),
      openAtLogin: Boolean(enabled),
    });

    const next = getStartupSetting();

    return {
      ...next,
      ok: true,
      message: next.openAtLogin ? 'Seenary will launch at login.' : 'Seenary will not launch at login.',
    };
  } catch (error) {
    const current = getStartupSetting();

    return {
      ...current,
      ok: false,
      message: error.message || 'Failed to update startup setting.',
    };
  }
}

function registerStartupIpc() {
  if (ipcMain.listenerCount('startup:get') === 0) {
    ipcMain.handle('startup:get', () => getStartupSetting());
  }

  if (ipcMain.listenerCount('startup:set') === 0) {
    ipcMain.handle('startup:set', (_event, enabled) => setStartupSetting(enabled));
  }
}

module.exports = {
  registerStartupIpc,
};
