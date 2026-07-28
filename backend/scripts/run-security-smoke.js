const { spawnSync } = require('child_process');
const path = require('path');

const electronBinary = require('electron');
const result = spawnSync(electronBinary, [path.join(__dirname, 'security-smoke.js')], {
  cwd: path.resolve(__dirname, '..'),
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
  },
  stdio: 'inherit',
  shell: false,
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
