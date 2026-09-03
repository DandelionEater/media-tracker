const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const handlers = new Map();
const listeners = new Map();
const calls = [];
const sandboxModule = { exports: {} };
const source = fs.readFileSync(path.resolve(__dirname, '..', 'appLifecycle.js'), 'utf8');

vm.runInNewContext(source, {
  module: sandboxModule,
  exports: sandboxModule.exports,
  console,
  require(id) {
    if (id !== 'electron') throw new Error(`Unexpected dependency: ${id}`);
    return {
      app: {
        quit: () => calls.push('quit'),
        relaunch: () => calls.push('relaunch'),
        exit: (code) => calls.push(`exit:${code}`),
      },
      ipcMain: {
        handle: (channel, handler) => handlers.set(channel, handler),
        on: (channel, handler) => listeners.set(channel, handler),
      },
      session: {
        defaultSession: {
          clearCache: async () => calls.push('http-cache'),
          clearCodeCaches: async () => calls.push('code-cache'),
          clearStorageData: async (options) => {
            assert.deepEqual([...options.storages], ['cachestorage', 'serviceworkers']);
            calls.push('cache-storage');
          },
        },
      },
    };
  },
}, { filename: 'appLifecycle.js' });

async function run() {
  sandboxModule.exports.registerAppLifecycleIpc();
  const result = await handlers.get('app:repair-caches')();
  assert.equal(result.ok, true);
  assert.deepEqual(calls, ['http-cache', 'code-cache', 'cache-storage']);
  listeners.get('app:restart')();
  assert.deepEqual(calls.slice(-2), ['relaunch', 'exit:0']);
  console.log('Cache maintenance preservation boundary and restart checks passed.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
