const { app, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');

const DEFAULT_UPDATE_FEED_URL = 'https://api.seenary.app/desktop-updates';
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

let checkTimer = null;
let isChecking = false;
let isDownloading = false;
let activeWindow = null;
let latestUpdateInfo = null;
let downloadedUpdateInfo = null;
let handlersRegistered = false;

function getUpdateFeedUrl() {
  return process.env.SEENARY_UPDATE_FEED_URL || DEFAULT_UPDATE_FEED_URL;
}

function setupAutoUpdates(win) {
  if (!app.isPackaged) {
    return;
  }

  activeWindow = win;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.setFeedURL({
    provider: 'generic',
    url: getUpdateFeedUrl(),
  });
  registerUpdaterIpc();

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

  checkForUpdates();
  checkTimer = setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL_MS);
  checkTimer.unref?.();
}

function checkForUpdates(win = null, options = {}) {
  if (!app.isPackaged || isChecking || isDownloading) {
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
    if (!app.isPackaged || isDownloading) {
      return { ok: false };
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
  if (checkTimer) {
    clearInterval(checkTimer);
    checkTimer = null;
  }
}

module.exports = {
  setupAutoUpdates,
  checkForUpdates,
  stopAutoUpdates,
};
