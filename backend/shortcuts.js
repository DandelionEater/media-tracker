const fs = require('fs');
const path = require('path');
const { app, globalShortcut, ipcMain } = require('electron');

const DEFAULT_HIDE_SHOW_SHORTCUT = 'Control+Space';
const SETTINGS_FILE = 'desktop-shortcuts.json';

let activeHideShowAccelerator = null;

function getSettingsPath() {
  return path.join(app.getPath('userData'), SETTINGS_FILE);
}

function readShortcutSettings() {
  try {
    const settingsPath = getSettingsPath();

    if (!fs.existsSync(settingsPath)) {
      return {
        hideShowEnabled: true,
        hideShowAccelerator: DEFAULT_HIDE_SHOW_SHORTCUT,
      };
    }

    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    return {
      hideShowEnabled: settings.hideShowEnabled !== false,
      hideShowAccelerator:
        typeof settings.hideShowAccelerator === 'string' && settings.hideShowAccelerator.trim()
          ? settings.hideShowAccelerator.trim()
          : DEFAULT_HIDE_SHOW_SHORTCUT,
    };
  } catch {
    return {
      hideShowEnabled: true,
      hideShowAccelerator: DEFAULT_HIDE_SHOW_SHORTCUT,
    };
  }
}

function writeShortcutSettings(settings) {
  const settingsPath = getSettingsPath();
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

function getHideShowShortcutSetting() {
  const settings = readShortcutSettings();
  return {
    ok: true,
    enabled: settings.hideShowEnabled,
    accelerator: settings.hideShowAccelerator,
    defaultAccelerator: DEFAULT_HIDE_SHOW_SHORTCUT,
  };
}

function normalizeAccelerator(value) {
  return String(value || '')
    .trim()
    .replace(/\s*\+\s*/g, '+');
}

function registerHideShowShortcut(win, accelerator) {
  const normalizedAccelerator = normalizeAccelerator(accelerator);

  if (!normalizedAccelerator) {
    return false;
  }

  const registered = globalShortcut.register(normalizedAccelerator, () => {
    if (win.isVisible()) {
      win.hide();
    } else {
      win.show();
      win.focus();

      win.webContents.send('focus-search');
    }
  });

  if (registered) {
    activeHideShowAccelerator = normalizedAccelerator;
  }

  return registered;
}

function unregisterHideShowShortcut() {
  if (activeHideShowAccelerator) {
    globalShortcut.unregister(activeHideShowAccelerator);
    activeHideShowAccelerator = null;
  }
}

function registerShortcuts(win) {
  unregisterHideShowShortcut();

  const settings = readShortcutSettings();

  if (!settings.hideShowEnabled) {
    return;
  }

  registerHideShowShortcut(win, settings.hideShowAccelerator);
}

function updateHideShowShortcutSetting(win, payload = {}) {
  const enabled = Boolean(payload.enabled);
  const accelerator = normalizeAccelerator(payload.accelerator || DEFAULT_HIDE_SHOW_SHORTCUT);

  unregisterHideShowShortcut();

  if (!enabled) {
    writeShortcutSettings({
      hideShowEnabled: false,
      hideShowAccelerator: accelerator,
    });

    return {
      ok: true,
      enabled: false,
      accelerator,
      message: 'Hide/show shortcut disabled.',
    };
  }

  if (!accelerator) {
    return {
      ok: false,
      enabled: true,
      accelerator,
      message: 'Enter a keyboard shortcut first.',
    };
  }

  const registered = registerHideShowShortcut(win, accelerator);

  if (!registered) {
    const current = readShortcutSettings();

    if (current.hideShowEnabled) {
      registerHideShowShortcut(win, current.hideShowAccelerator);
    }

    return {
      ok: false,
      enabled: current.hideShowEnabled,
      accelerator: current.hideShowAccelerator,
      message: `Could not register ${accelerator}. It may be used by another app.`,
    };
  }

  writeShortcutSettings({
    hideShowEnabled: true,
    hideShowAccelerator: accelerator,
  });

  return {
    ok: true,
    enabled: true,
    accelerator,
    message: `Hide/show shortcut set to ${accelerator}.`,
  };
}

function registerShortcutIpc(getWindow) {
  if (ipcMain.listenerCount('shortcuts:get-hide-show') === 0) {
    ipcMain.handle('shortcuts:get-hide-show', () => getHideShowShortcutSetting());
  }

  if (ipcMain.listenerCount('shortcuts:set-hide-show') === 0) {
    ipcMain.handle('shortcuts:set-hide-show', (_event, payload) => {
      const win = getWindow();

      if (!win || win.isDestroyed()) {
        return {
          ok: false,
          message: 'Seenary window is not ready.',
        };
      }

      return updateHideShowShortcutSetting(win, payload);
    });
  }
}

module.exports = {
  registerShortcuts,
  registerShortcutIpc,
};
