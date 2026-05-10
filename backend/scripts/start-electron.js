const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const electron = require('electron');

const packageRoot = path.resolve(__dirname, '..');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const userDataDir = path.join(packageRoot, '.electron-user-data');
const logPath = path.join(userDataDir, 'electron-dev.log');
const mainPath = path.join(packageRoot, 'scripts', 'electron-main-wrapper.js');
const args = [
  '--disable-crash-reporter',
  '--disable-gpu',
  '--disable-software-rasterizer',
  '--no-sandbox',
  `--user-data-dir=${userDataDir}`,
  mainPath,
];

fs.mkdirSync(userDataDir, { recursive: true });
const logStream = fs.createWriteStream(logPath, { flags: 'a' });

const child = spawn(electron, args, {
  cwd: packageRoot,
  env,
  stdio: ['inherit', 'inherit', 'pipe'],
  windowsHide: false,
});

child.stderr.pipe(logStream);

child.on('exit', (code, signal) => {
  logStream.end();

  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
