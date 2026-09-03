const { app, ipcMain, session } = require('electron');

let isRegistered = false;

function registerAppLifecycleIpc() {
  if (isRegistered) return;
  isRegistered = true;

  ipcMain.on('app:quit', () => {
    app.quit();
  });

  ipcMain.on('app:restart', () => {
    app.relaunch();
    app.exit(0);
  });

  ipcMain.handle('app:repair-caches', async () => {
    try {
      const desktopSession = session.defaultSession;
      await desktopSession.clearCache();
      if (typeof desktopSession.clearCodeCaches === 'function') {
        await desktopSession.clearCodeCaches({});
      }
      await desktopSession.clearStorageData({
        storages: ['cachestorage', 'serviceworkers'],
      });
      return { ok: true, clearedWebCache: true };
    } catch (error) {
      console.error('Failed to repair desktop caches:', error);
      return {
        ok: false,
        clearedWebCache: false,
        message: error?.message || 'Seenary could not clear the desktop web cache.',
      };
    }
  });
}

module.exports = { registerAppLifecycleIpc };
