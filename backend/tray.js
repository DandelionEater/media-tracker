const { Tray, Menu, app } = require('electron');
const path = require('path');

let tray;

function setupTray(win, options = {}) {
  const iconPath = path.join(__dirname, 'tray.png');

  if (!tray) {
    tray = new Tray(iconPath);
  }

  function refreshContextMenu() {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show / Hide',
        click: () => {
          win.isVisible() ? win.hide() : win.show();
        },
      },
      ...(options.onToggleGamingMode
        ? [
            {
              label: Boolean(options.isGamingModeEnabled?.())
                ? 'Gaming mode: On'
                : 'Gaming mode: Off',
              click: () => {
                options.onToggleGamingMode(!Boolean(options.isGamingModeEnabled?.()));
                refreshContextMenu();
              },
            },
          ]
        : []),
      ...(options.onCheckForUpdates
        ? [
            {
              label: 'Check for Updates',
              click: () => {
                options.onCheckForUpdates();
              },
            },
          ]
        : []),
      {
        type: 'separator',
      },
      {
        label: 'Exit',
        click: () => {
          app.quit();
        },
      },
    ]);

    tray.setContextMenu(contextMenu);
  }

  tray.setToolTip('Seenary');
  refreshContextMenu();

  tray.removeAllListeners('click');
  tray.on('click', () => {
    win.isVisible() ? win.hide() : win.show();
  });
}

module.exports = { setupTray };
