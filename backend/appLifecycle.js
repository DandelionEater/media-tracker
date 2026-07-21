const { app, ipcMain } = require('electron');

let isRegistered = false;

function registerAppLifecycleIpc() {
  if (isRegistered) return;
  isRegistered = true;

  ipcMain.on('app:quit', () => {
    app.quit();
  });
}

module.exports = { registerAppLifecycleIpc };
