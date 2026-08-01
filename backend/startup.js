const { app, ipcMain } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const LINUX_AUTOSTART_FILENAME = 'app.seenary.desktop-autostart.desktop';
const LINUX_HIDDEN_ARGUMENT = '--hidden';

function getLinuxAutostartPath(environment = process.env, homeDirectory = os.homedir()) {
  const isFlatpak =
    typeof environment.FLATPAK_ID === 'string' && environment.FLATPAK_ID.trim();
  const configHome =
    !isFlatpak &&
    typeof environment.XDG_CONFIG_HOME === 'string' &&
    environment.XDG_CONFIG_HOME.trim()
      ? environment.XDG_CONFIG_HOME.trim()
      : path.join(homeDirectory, '.config');
  return path.join(configHome, 'autostart', LINUX_AUTOSTART_FILENAME);
}

function getLinuxAutostartCommand(
  environment = process.env,
  executablePath = process.execPath
) {
  if (typeof environment.FLATPAK_ID === 'string' && environment.FLATPAK_ID.trim()) {
    return ['flatpak', 'run', environment.FLATPAK_ID.trim(), LINUX_HIDDEN_ARGUMENT];
  }

  if (typeof environment.APPIMAGE === 'string' && environment.APPIMAGE.trim()) {
    return [environment.APPIMAGE.trim(), LINUX_HIDDEN_ARGUMENT];
  }

  return [executablePath, LINUX_HIDDEN_ARGUMENT];
}

function quoteDesktopExecArgument(value) {
  const text = String(value).replace(/%/g, '%%');
  if (/^[A-Za-z0-9_./:@+=,-]+$/.test(text)) {
    return text;
  }

  return `"${text.replace(/([\\`"$])/g, '\\$1')}"`;
}

function createLinuxAutostartEntry(options = {}) {
  const command = getLinuxAutostartCommand(
    options.environment,
    options.executablePath
  );
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Version=1.0',
    'Name=Seenary',
    'Comment=Start Seenary quietly when you log in',
    `Exec=${command.map(quoteDesktopExecArgument).join(' ')}`,
    'Icon=app.seenary.desktop',
    'Terminal=false',
    'StartupNotify=false',
    'X-GNOME-Autostart-enabled=true',
    '',
  ].join('\n');
}

function getLinuxStartupSetting() {
  const autostartPath = getLinuxAutostartPath();
  try {
    return {
      ok: true,
      available: true,
      openAtLogin: fs.existsSync(autostartPath),
      method: process.env.FLATPAK_ID ? 'flatpak-xdg' : 'xdg',
    };
  } catch (error) {
    return {
      ok: false,
      available: true,
      openAtLogin: false,
      message: error.message || 'Failed to read the Linux startup setting.',
    };
  }
}

function setLinuxStartupSetting(enabled) {
  const autostartPath = getLinuxAutostartPath();
  try {
    if (enabled) {
      const autostartDirectory = path.dirname(autostartPath);
      fs.mkdirSync(autostartDirectory, { recursive: true, mode: 0o700 });
      const temporaryPath = `${autostartPath}.${process.pid}.tmp`;
      fs.writeFileSync(temporaryPath, createLinuxAutostartEntry(), {
        encoding: 'utf8',
        mode: 0o600,
      });
      fs.renameSync(temporaryPath, autostartPath);
    } else {
      fs.rmSync(autostartPath, { force: true });
    }

    return {
      ...getLinuxStartupSetting(),
      ok: true,
      message: enabled
        ? 'Seenary will launch quietly at login.'
        : 'Seenary will not launch at login.',
    };
  } catch (error) {
    const current = getLinuxStartupSetting();
    return {
      ...current,
      ok: false,
      message: error.message || 'Failed to update the Linux startup setting.',
    };
  }
}

function getLoginItemOptions() {
  if (process.platform === 'win32') {
    return { path: process.execPath };
  }

  return {};
}

function getStartupSetting() {
  if (process.platform === 'linux') {
    if (!app.isPackaged) {
      return {
        ok: true,
        available: false,
        openAtLogin: false,
        message: 'Launch at login is available after installing Seenary.',
      };
    }

    return getLinuxStartupSetting();
  }

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
  if (process.platform === 'linux') {
    if (!app.isPackaged) {
      return {
        ok: false,
        available: false,
        openAtLogin: false,
        message: 'Launch at login is available after installing Seenary.',
      };
    }

    return setLinuxStartupSetting(Boolean(enabled));
  }

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
  createLinuxAutostartEntry,
  getLinuxAutostartCommand,
  getLinuxAutostartPath,
  registerStartupIpc,
};
