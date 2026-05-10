const path = require('path');
const { app } = require('electron');

app.setPath('userData', path.join(__dirname, '..', '.electron-user-data'));
app.setPath('crashDumps', path.join(__dirname, '..', '.electron-crash-dumps'));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

require('../main');
