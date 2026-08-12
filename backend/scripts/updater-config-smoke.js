const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const backendDir = path.resolve(__dirname, '..');
const packageJson = require('../package.json');
const updaterSource = fs.readFileSync(path.join(backendDir, 'updater.js'), 'utf8');
const provider = packageJson.build?.publish?.[0];
const windowsArtifactName = packageJson.build?.win?.artifactName;

assert.deepEqual(provider, {
  provider: 'github',
  owner: 'DandelionEater',
  repo: 'Seenary',
  private: false,
  tagNamePrefix: 'v',
});
assert.equal(
  windowsArtifactName,
  '${productName}-Setup-${version}.${ext}',
  'The Windows artifact name must remain GitHub-safe and match update metadata.'
);

function exerciseUpdater(version) {
  const autoUpdater = {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    allowPrerelease: null,
    on() {},
    checkForUpdates() {
      return Promise.resolve();
    },
    setFeedURL() {
      throw new Error('The packaged app-update.yml should configure the GitHub provider.');
    },
  };
  const app = {
    isPackaged: true,
    getVersion: () => version,
  };
  const module = { exports: {} };
  const timer = { unref() {} };
  const context = {
    require(id) {
      if (id === 'electron') {
        return { app, ipcMain: { handle() {} } };
      }
      if (id === 'electron-updater') {
        return { autoUpdater };
      }
      throw new Error(`Unexpected updater dependency: ${id}`);
    },
    module,
    exports: module.exports,
    console,
    process: { platform: 'win32' },
    setTimeout: () => timer,
    clearTimeout() {},
    setInterval: () => timer,
    clearInterval() {},
  };

  vm.runInNewContext(updaterSource, context, { filename: 'updater.js' });
  module.exports.setupAutoUpdates({
    isDestroyed: () => false,
    webContents: { send() {} },
  });

  return autoUpdater;
}

const betaUpdater = exerciseUpdater('0.1.9-beta');
assert.equal(betaUpdater.allowPrerelease, true);
assert.equal(betaUpdater.autoDownload, false);
assert.equal(betaUpdater.autoInstallOnAppQuit, false);

const stableUpdater = exerciseUpdater('0.2.0');
assert.equal(stableUpdater.allowPrerelease, false);

console.log('GitHub updater configuration checks passed.');
