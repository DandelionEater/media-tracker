const fs = require('fs');
const os = require('os');
const path = require('path');

require('../env');

// Keep this smoke test deterministic on clean CI runners without relying on a
// developer or production .env file. The test database is temporary and this
// key is used only to verify the encryption and migration paths below.
process.env.TOKEN_ENCRYPTION_KEY =
  '6ef46376b2180dd0336809f9dd58d285810dc871994d9a2465f4e872406a83f8';

async function closeServer(server) {
  if (!server?.listening) return;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'seenary-security-'));
  process.env.DATABASE_PATH = path.join(tempRoot, 'security.sqlite');

  let dbModule;
  let apiServer;

  try {
  dbModule = require('../db');
  const { db, upsertAniListAccount, upsertMalAccount } = dbModule;

  db.prepare(`
    INSERT INTO users (
      username,
      username_normalized,
      password_hash,
      local_credentials_confirmed
    ) VALUES (?, ?, ?, 1)
  `).run('security_test', 'security_test', 'not-used-by-this-test');

  const userId = Number(
    db.prepare('SELECT id FROM users WHERE username_normalized = ?').get('security_test').id
  );

  upsertAniListAccount({
    userId,
    anilistUserId: 101,
    anilistUsername: 'security_anilist',
    originalAniListUsername: 'security_anilist',
    accessToken: 'anilist-access-token',
  });
  upsertMalAccount({
    userId,
    malUserId: 202,
    malUsername: 'security_mal',
    originalMalUsername: 'security_mal',
    accessToken: 'mal-access-token',
    refreshToken: 'mal-refresh-token',
    tokenExpiresAt: Date.now() + 60_000,
  });

  const storedAniList = db
    .prepare('SELECT access_token FROM anilist_accounts WHERE user_id = ?')
    .get(userId);
  const storedMal = db
    .prepare('SELECT access_token, refresh_token FROM mal_accounts WHERE user_id = ?')
    .get(userId);

  for (const value of [
    storedAniList.access_token,
    storedMal.access_token,
    storedMal.refresh_token,
  ]) {
    if (!String(value).startsWith('seenary:v1:')) {
      throw new Error('An OAuth token was stored without encryption.');
    }
  }

  const aniListAccount = dbModule.getAniListAccountByUserId(userId);
  const malAccount = dbModule.getMalAccountByUserId(userId);
  if (aniListAccount.access_token !== 'anilist-access-token') {
    throw new Error('AniList token did not decrypt correctly.');
  }
  if (
    malAccount.access_token !== 'mal-access-token' ||
    malAccount.refresh_token !== 'mal-refresh-token'
  ) {
    throw new Error('MyAnimeList tokens did not decrypt correctly.');
  }

  if (db.pragma('foreign_keys', { simple: true }) !== 1) {
    throw new Error('SQLite foreign key enforcement is disabled.');
  }
  if (db.pragma('quick_check(1)', { simple: true }) !== 'ok') {
    throw new Error('SQLite integrity validation failed.');
  }

  db.prepare('UPDATE anilist_accounts SET access_token = ? WHERE user_id = ?').run(
    'legacy-plaintext-token',
    userId
  );
  db.close();
  delete require.cache[require.resolve('../db')];
  dbModule = require('../db');

  const migratedToken = dbModule.db
    .prepare('SELECT access_token FROM anilist_accounts WHERE user_id = ?')
    .get(userId).access_token;
  if (!String(migratedToken).startsWith('seenary:v1:')) {
    throw new Error('A legacy plaintext OAuth token was not migrated at startup.');
  }
  if (dbModule.getAniListAccountByUserId(userId).access_token !== 'legacy-plaintext-token') {
    throw new Error('A migrated OAuth token did not decrypt correctly.');
  }

  const backupDirectory = path.join(tempRoot, 'backups');
  const { createDatabaseBackup } = require('../databaseBackups');
  const backupResult = await createDatabaseBackup(dbModule.db, process.env.DATABASE_PATH, {
    backupDirectory,
    intervalMs: 1,
    retention: 2,
  });
  if (!backupResult.created || !fs.existsSync(backupResult.destination)) {
    throw new Error('SQLite online backup was not created.');
  }

  process.env.RPC_RATE_LIMIT_MAX = '3';
  process.env.RPC_RATE_LIMIT_WINDOW_MS = '60000';
  process.env.PORT = '0';
  process.env.DB_BACKUP_INTERVAL_HOURS = '0';
  const { server } = require('../server');
  apiServer = server;
  if (!server.listening) {
    await new Promise((resolve) => server.once('listening', resolve));
  }
  const address = server.address();
  const apiOrigin = `http://127.0.0.1:${address.port}`;

  const healthResponse = await fetch(`${apiOrigin}/health`);
  if (
    healthResponse.status !== 200 ||
    healthResponse.headers.get('x-content-type-options') !== 'nosniff'
  ) {
    throw new Error('API health response is missing security headers.');
  }

  const blockedOriginResponse = await fetch(`${apiOrigin}/rpc`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://attacker.invalid',
    },
    body: JSON.stringify({ method: 'getSession', args: [] }),
  });
  if (blockedOriginResponse.status !== 403) {
    throw new Error('API accepted a request from an untrusted browser origin.');
  }

  const wrongContentTypeResponse = await fetch(`${apiOrigin}/rpc`, {
    method: 'POST',
    body: JSON.stringify({ method: 'getSession', args: [] }),
  });
  if (wrongContentTypeResponse.status !== 415) {
    throw new Error('API accepted an RPC request without JSON content type.');
  }

  const requestRpc = () =>
    fetch(`${apiOrigin}/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'getSession', args: [] }),
    });
  const allowedResponses = await Promise.all([requestRpc(), requestRpc(), requestRpc()]);
  if (allowedResponses.some((response) => response.status !== 200)) {
    throw new Error('API rate limiting blocked a request before the configured threshold.');
  }
  if ((await requestRpc()).status !== 429) {
    throw new Error('API rate limiting did not reject an over-limit request.');
  }

  await closeServer(apiServer);
  apiServer = null;

  console.log('Security smoke checks passed.');
  } finally {
    await closeServer(apiServer);
    dbModule?.db?.close();
    const resolvedTempRoot = path.resolve(tempRoot);
    const resolvedOsTemp = path.resolve(os.tmpdir());
    if (
      resolvedTempRoot.startsWith(`${resolvedOsTemp}${path.sep}`) &&
      path.basename(resolvedTempRoot).startsWith('seenary-security-')
    ) {
      fs.rmSync(resolvedTempRoot, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
