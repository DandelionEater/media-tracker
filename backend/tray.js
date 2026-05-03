const { Tray, Menu, app } = require('electron');
const path = require('path');

let tray;

function setupTray(win) {
  const iconPath = path.join(__dirname, 'icon.png');

  tray = new Tray(iconPath);

  // ✅ Context menu (RMB)
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show / Hide',
      click: () => {
        win.isVisible() ? win.hide() : win.show();
      },
    },
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
