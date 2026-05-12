const { Tray, Menu, app } = require('electron');
const path = require('path');

let tray;

function setupTray(win, options = {}) {
  const iconPath = path.join(__dirname, 'tray.png');

  tray = new Tray(iconPath);

  // ✅ Context menu (RMB)
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show / Hide',
      click: () => {
        win.isVisible() ? win.hide() : win.show();
      },
    },
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

  tray.setToolTip('Seenary');
  tray.setContextMenu(contextMenu);

  // ✅ KEEP your existing behavior (LMB toggle)
  tray.on('click', () => {
    win.isVisible() ? win.hide() : win.show();
  });
}

module.exports = { setupTray };
