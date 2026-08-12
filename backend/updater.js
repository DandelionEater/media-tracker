const { app, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');

const UPDATE_CHECK_INTERVAL_MS = 3 * 60 * 60 * 1000;
const STARTUP_CHECK_DELAY_MS = 10 * 1000;
const UPDATE_DIALOG_PREVIEW = process.env?.SEENARY_PREVIEW_UPDATE_DIALOG === '1';

let checkTimer = null;
let startupCheckTimer = null;
let isChecking = false;
let isDownloading = false;
let activeWindow = null;
let latestUpdateInfo = null;
let downloadedUpdateInfo = null;
let handlersRegistered = false;
let updaterEventsRegistered = false;

function isAutoUpdateAvailable() {
  return process.platform !== 'linux';
}

function setupAutoUpdates(win) {
  activeWindow = win;
  registerUpdaterIpc();

  if (UPDATE_DIALOG_PREVIEW) {
    latestUpdateInfo = normalizeUpdateInfo({
      version: '0.1.9-beta',
      releaseName: 'Seenary 0.1.9 Beta',
      releaseNotes: [
        'A new Seenary update is ready.',
        '',
        '- Smoother desktop updates through GitHub Releases',
        '- Visual refinements and reliability improvements',
      ].join('\n'),
      releaseDate: new Date().toISOString(),
    });
    return;
  }

  if (!app.isPackaged || !isAutoUpdateAvailable()) {
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = app.getVersion().includes('-');
  registerUpdaterEvents();

  scheduleStartupCheck();
  scheduleRecurringChecks();
}

function registerUpdaterEvents() {
  if (updaterEventsRegistered) {
    return;
  }

  updaterEventsRegistered = true;

  autoUpdater.on('checking-for-update', () => {
    isChecking = true;
  });

  autoUpdater.on('update-not-available', () => {
    isChecking = false;
  });

  autoUpdater.on('update-available', (info) => {
    isChecking = false;
    latestUpdateInfo = normalizeUpdateInfo(info);

    if (isDownloading) {
      return;
    }

    sendToRenderer('updater:update-available', latestUpdateInfo);
  });

  autoUpdater.on('download-progress', (progress) => {
    sendToRenderer('updater:downloading', {
      percent: Math.round(progress.percent || 0),
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    isDownloading = false;
    downloadedUpdateInfo = normalizeUpdateInfo(info);
    sendToRenderer('updater:update-downloaded', downloadedUpdateInfo);
  });

  autoUpdater.on('error', (error) => {
    handleUpdateError(error);
  });
}

function scheduleStartupCheck() {
  if (startupCheckTimer) {
    clearTimeout(startupCheckTimer);
  }

  startupCheckTimer = setTimeout(() => {
    startupCheckTimer = null;
    checkForUpdates();
  }, STARTUP_CHECK_DELAY_MS);
  startupCheckTimer.unref?.();
}

function scheduleRecurringChecks() {
  if (checkTimer) {
    return;
  }

  checkTimer = setInterval(() => {
    checkForUpdates();
  }, UPDATE_CHECK_INTERVAL_MS);
  checkTimer.unref?.();
}

function checkForUpdates(win = null) {
  if (!app.isPackaged || !isAutoUpdateAvailable() || isChecking || isDownloading) {
    return;
  }

  activeWindow = win || activeWindow;

  autoUpdater.checkForUpdates().catch((error) => {
    handleUpdateError(error);
  });
}

function registerUpdaterIpc() {
  if (handlersRegistered) {
    return;
  }

  handlersRegistered = true;

  ipcMain.handle('updater:download', async () => {
    if (UPDATE_DIALOG_PREVIEW) {
      return {
        ok: false,
        message: 'This is an update-dialog preview; no update will be downloaded.',
      };
    }

    if (!app.isPackaged || !isAutoUpdateAvailable() || isDownloading) {
      return {
        ok: false,
        message: isAutoUpdateAvailable()
          ? 'Seenary updates are available after installing the desktop app.'
          : 'Automatic updates are not enabled in this first Linux test build.',
      };
    }

    isDownloading = true;
    sendToRenderer('updater:downloading', { percent: 0 });

    try {
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (error) {
      handleUpdateError(error);
      return {
        ok: false,
        message: error.message || 'Seenary could not download the update.',
      };
    }
  });

  ipcMain.handle('updater:install', () => {
    if (!app.isPackaged || !downloadedUpdateInfo) {
      return { ok: false };
    }

    autoUpdater.quitAndInstall(false, true);
    return { ok: true };
  });

  ipcMain.handle('updater:remind-later', () => {
    return { ok: true };
  });

  ipcMain.handle('updater:get-state', () => getUpdateState());
}

function sendToRenderer(channel, payload) {
  const target = activeWindow && !activeWindow.isDestroyed() ? activeWindow : null;

  if (!target) {
    return;
  }

  target.webContents.send(channel, payload);
}

function normalizeUpdateInfo(info = {}) {
  return {
    version: info.version || '',
    releaseName: info.releaseName || `Seenary ${info.version || ''}`.trim(),
    releaseNotes: normalizeReleaseNotes(info.releaseNotes),
    releaseDate: info.releaseDate || null,
  };
}

function normalizeReleaseNotes(releaseNotes) {
  if (Array.isArray(releaseNotes)) {
    return releaseNotes
      .map((note) => {
        if (typeof note === 'string') {
          return note;
        }

        return note?.note || note?.text || '';
      })
      .filter(Boolean)
      .join('\n');
  }

  return typeof releaseNotes === 'string' ? releaseNotes : '';
}

function handleUpdateError(error) {
  isChecking = false;
  isDownloading = false;
  console.error('Auto update error:', error);
  sendToRenderer('updater:error', {
    message: error.message || 'Seenary could not check for updates.',
  });
}

function stopAutoUpdates() {
  if (startupCheckTimer) {
    clearTimeout(startupCheckTimer);
    startupCheckTimer = null;
  }

  if (checkTimer) {
    clearInterval(checkTimer);
    checkTimer = null;
  }
}

function getUpdateState() {
  return {
    ok: true,
    available: isAutoUpdateAvailable(),
    checking: isChecking,
    downloading: isDownloading,
    intervalMs: UPDATE_CHECK_INTERVAL_MS,
    availableUpdate: latestUpdateInfo,
    downloadedUpdate: downloadedUpdateInfo,
  };
}

module.exports = {
  setupAutoUpdates,
  checkForUpdates,
  isAutoUpdateAvailable,
  stopAutoUpdates,
};
