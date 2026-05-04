const { app, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');

const DEFAULT_UPDATE_FEED_URL = 'https://api.seenary.app/desktop-updates';
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

let checkTimer = null;
let isChecking = false;
let isDownloading = false;
let manualCheckWindow = null;

function getUpdateFeedUrl() {
  return process.env.SEENARY_UPDATE_FEED_URL || DEFAULT_UPDATE_FEED_URL;
}

function setupAutoUpdates(win) {
  if (!app.isPackaged) {
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.setFeedURL({
    provider: 'generic',
    url: getUpdateFeedUrl(),
  });

  autoUpdater.on('checking-for-update', () => {
    isChecking = true;
  });

  autoUpdater.on('update-not-available', () => {
    isChecking = false;

    if (manualCheckWindow) {
      dialog.showMessageBox(manualCheckWindow, {
        type: 'info',
        buttons: ['OK'],
        title: 'Seenary is up to date',
        message: 'You are already using the latest version of Seenary.',
      });
      manualCheckWindow = null;
    }
  });

  autoUpdater.on('update-available', async (info) => {
    isChecking = false;
    manualCheckWindow = null;

    if (isDownloading) {
      return;
    }

    const choice = await dialog.showMessageBox(win, {
      type: 'info',
      buttons: ['Download update', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Seenary update available',
      message: `Seenary ${info.version} is available.`,
      detail: 'Download it now? You can keep using Seenary while the update downloads.',
    });

    if (choice.response !== 0) {
      return;
    }

    isDownloading = true;
    autoUpdater.downloadUpdate().catch((error) => {
      isDownloading = false;
      console.error('Failed to download update:', error);
      dialog.showErrorBox(
        'Update download failed',
        error.message || 'Seenary could not download the update.'
      );
    });
  });

  autoUpdater.on('update-downloaded', async (info) => {
    isDownloading = false;

    const choice = await dialog.showMessageBox(win, {
      type: 'info',
      buttons: ['Restart and install', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Seenary update ready',
      message: `Seenary ${info.version} is ready to install.`,
      detail: 'Restart Seenary now to install the update?',
    });

    if (choice.response === 0) {
      autoUpdater.quitAndInstall(false, true);
    }
  });

  autoUpdater.on('error', (error) => {
    isChecking = false;
    isDownloading = false;
    manualCheckWindow = null;
    console.error('Auto update error:', error);
  });

  checkForUpdates();
  checkTimer = setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL_MS);
  checkTimer.unref?.();
}

function checkForUpdates(win = null, options = {}) {
  if (!app.isPackaged || isChecking || isDownloading) {
    return;
  }

  manualCheckWindow = options.manual ? win : null;

  autoUpdater.checkForUpdates().catch((error) => {
    isChecking = false;
    manualCheckWindow = null;
    console.error('Failed to check for updates:', error);

    if (options.manual && win) {
      dialog.showErrorBox(
        'Update check failed',
        error.message || 'Seenary could not check for updates.'
      );
    }
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
