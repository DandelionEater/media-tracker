const { spawnSync } = require('child_process');
const path = require('path');

const packageJson = require('../package.json');

const backendDir = path.resolve(__dirname, '..');
const releaseDir = path.resolve(backendDir, '..', 'release', packageJson.version);
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const builderCommand = process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: backendDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

run(npmCommand, ['run', 'build:frontend']);
run(builderCommand, [
  '--win',
  'nsis',
  `--config.directories.output=${path.relative(backendDir, releaseDir)}`,
]);
run(process.execPath, ['scripts/write-release-notes.js', releaseDir], { shell: false });
