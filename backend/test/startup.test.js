const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  createLinuxAutostartEntry,
  getLinuxAutostartCommand,
  getLinuxAutostartPath,
} = require('../startup');

test('uses the XDG config directory for the Linux autostart entry', () => {
  assert.equal(
    getLinuxAutostartPath(
      { XDG_CONFIG_HOME: '/home/tester/custom config' },
      '/home/tester'
    ),
    path.join(
      '/home/tester/custom config',
      'autostart',
      'app.seenary.desktop-autostart.desktop'
    )
  );

  assert.equal(
    getLinuxAutostartPath({}, '/home/tester'),
    path.join(
      '/home/tester',
      '.config',
      'autostart',
      'app.seenary.desktop-autostart.desktop'
    )
  );

  assert.equal(
    getLinuxAutostartPath(
      {
        FLATPAK_ID: 'app.seenary.desktop',
        XDG_CONFIG_HOME: '/home/tester/.var/app/app.seenary.desktop/config',
      },
      '/home/tester'
    ),
    path.join(
      '/home/tester',
      '.config',
      'autostart',
      'app.seenary.desktop-autostart.desktop'
    )
  );
});

test('uses package-aware Linux startup commands', () => {
  assert.deepEqual(
    getLinuxAutostartCommand(
      { FLATPAK_ID: 'app.seenary.desktop', APPIMAGE: '/ignored.AppImage' },
      '/ignored/seenary'
    ),
    ['flatpak', 'run', 'app.seenary.desktop', '--hidden']
  );
  assert.deepEqual(
    getLinuxAutostartCommand(
      { APPIMAGE: '/home/tester/Seenary 0.1.8.AppImage' },
      '/tmp/.mount/seenary'
    ),
    ['/home/tester/Seenary 0.1.8.AppImage', '--hidden']
  );
  assert.deepEqual(
    getLinuxAutostartCommand({}, '/opt/Seenary/seenary'),
    ['/opt/Seenary/seenary', '--hidden']
  );
});

test('creates a quiet desktop autostart entry with escaped paths', () => {
  const entry = createLinuxAutostartEntry({
    environment: { APPIMAGE: '/home/tester/My Apps/Seenary.AppImage' },
    executablePath: '/ignored/seenary',
  });

  assert.match(entry, /^\[Desktop Entry\]/);
  assert.match(
    entry,
    /^Exec="\/home\/tester\/My Apps\/Seenary\.AppImage" --hidden$/m
  );
  assert.match(entry, /^Terminal=false$/m);
  assert.match(entry, /^X-GNOME-Autostart-enabled=true$/m);

  const percentEntry = createLinuxAutostartEntry({
    environment: { APPIMAGE: '/home/tester/100% Seenary.AppImage' },
    executablePath: '/ignored/seenary',
  });
  assert.match(
    percentEntry,
    /^Exec="\/home\/tester\/100%% Seenary\.AppImage" --hidden$/m
  );
});

test('test helpers are platform independent', () => {
  assert.equal(typeof os.homedir(), 'string');
});
