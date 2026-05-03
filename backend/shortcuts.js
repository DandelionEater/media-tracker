const { globalShortcut } = require('electron');

function registerShortcuts(win) {
  globalShortcut.register('Control+Space', () => {
    if (win.isVisible()) {
      win.hide();
    } else {
      win.show();
      win.focus();

      win.webContents.send('focus-search');
    }
  });
}

module.exports = { registerShortcuts };
