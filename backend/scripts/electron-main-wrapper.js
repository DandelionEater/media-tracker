const path = require('path');
const { app } = require('electron');

const isUpdatePreview = process.env.SEENARY_PREVIEW_UPDATE_DIALOG === '1';
app.setPath(
  'userData',
  path.join(__dirname, '..', isUpdatePreview ? '.electron-update-preview' : '.electron-user-data'),
);
app.setPath('crashDumps', path.join(__dirname, '..', '.electron-crash-dumps'));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

require(isUpdatePreview ? '../desktop-main' : '../main');
