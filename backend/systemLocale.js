const { app, ipcMain } = require('electron');
const { execFileSync } = require('child_process');

const WINDOWS_INTERNATIONAL_REGISTRY_KEY = 'HKCU\\Control Panel\\International';
const WINDOWS_REGISTRY_VALUES = [
  'LocaleName',
  'sShortDate',
  'sLongDate',
  'sShortTime',
  'sTimeFormat',
  'iTime',
  's1159',
  's2359',
  'sDate',
  'sTime',
];

function readWindowsRegistryValue(name) {
  try {
    const output = execFileSync(
      'reg',
      ['query', WINDOWS_INTERNATIONAL_REGISTRY_KEY, '/v', name],
      { encoding: 'utf8', windowsHide: true }
    );
    const match = output.match(new RegExp(`\\s${name}\\s+REG_\\w+\\s+(.+)`, 'i'));

    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

function getWindowsRegionalFormat() {
  if (process.platform !== 'win32') {
    return null;
  }

  const values = Object.fromEntries(
    WINDOWS_REGISTRY_VALUES.map((name) => [name, readWindowsRegistryValue(name)])
  );

  return {
    localeName: values.LocaleName,
    shortDate: values.sShortDate,
    longDate: values.sLongDate,
    shortTime: values.sShortTime,
    longTime: values.sTimeFormat,
    is24Hour: values.iTime === '1',
    amDesignator: values.s1159,
    pmDesignator: values.s2359,
    dateSeparator: values.sDate,
    timeSeparator: values.sTime,
  };
}

function getSystemLocaleInfo() {
  const preferredLanguages =
    typeof app.getPreferredSystemLanguages === 'function'
      ? app.getPreferredSystemLanguages()
      : [];
  const systemLocale =
    typeof app.getSystemLocale === 'function' ? app.getSystemLocale() : null;
  const appLocale = typeof app.getLocale === 'function' ? app.getLocale() : null;
  const locales = [...preferredLanguages, systemLocale, appLocale].filter(Boolean);

  return {
    locale: locales[0] || null,
    locales: [...new Set(locales)],
    regionalFormat: getWindowsRegionalFormat(),
  };
}

function registerSystemLocaleIpc() {
  ipcMain.on('system-locale:get', (event) => {
    event.returnValue = getSystemLocaleInfo();
  });

  ipcMain.handle('system-locale:get-async', () => getSystemLocaleInfo());
}

module.exports = {
  getSystemLocaleInfo,
  registerSystemLocaleIpc,
};
