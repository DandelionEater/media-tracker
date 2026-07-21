const assert = require('assert');
const path = require('path');

async function run() {
  const mode = process.argv[2];
  const databasePath = process.env.DATABASE_PATH;

  if (!databasePath) {
    throw new Error('DATABASE_PATH is required for release data smoke tests.');
  }

  if (!['fresh', 'legacy'].includes(mode)) {
    throw new Error('Expected smoke-test mode "fresh" or "legacy".');
  }

  if (mode === 'legacy') {
    const argon2 = require('argon2');
    const Database = require('better-sqlite3');
    const legacyDb = new Database(databasePath);
    const passwordHash = await argon2.hash('legacy-password', { type: argon2.argon2id });

    legacyDb.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        username_normalized TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        tutorial_dismissed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_login_at TEXT
      )
    `);
    legacyDb
      .prepare('INSERT INTO users (username, username_normalized, password_hash) VALUES (?, ?, ?)')
      .run('legacy_user', 'legacy_user', passwordHash);
    legacyDb.close();
  }

  const db = require('../db');
  const auth = require('../auth');

  if (mode === 'legacy') {
    const migratedUser = db.getSafeUserById(1);
    assert.equal(migratedUser.local_credentials_confirmed, null);

    const login = await auth.loginUser('legacy_user', 'legacy-password');
    assert.equal(login.ok, true);
    assert.equal(login.user.local_credentials_confirmed, 1);
    console.log('Legacy database and credential migration passed.');
    return;
  }

  const localRegistration = await auth.registerUser('release_local', 'release-password');
  assert.equal(localRegistration.ok, true);
  assert.equal(localRegistration.user.local_credentials_confirmed, 1);
  auth.logoutUser();

  const linkedRegistration = await auth.createLinkedUser('release_oauth');
  assert.equal(linkedRegistration.ok, true);
  assert.equal(linkedRegistration.user.local_credentials_confirmed, 0);

  const passwordSetup = await auth.setLocalPassword(
    linkedRegistration.user.id,
    'release-oauth-password'
  );
  assert.equal(passwordSetup.ok, true);
  assert.equal(
    await auth.verifyLocalPassword(linkedRegistration.user.id, 'release-oauth-password'),
    true
  );

  const session = { authenticated: true, user: db.getSafeUserById(linkedRegistration.user.id) };
  const { mapAnimeForDb } = require('../animeMapper');
  const lists = require('../lists');
  const backup = require('../backup');
  const sharedMediaId = 303;
  db.saveAnimeSummary(
    mapAnimeForDb({
      id: sharedMediaId,
      title: { romaji: 'Release Anime', userPreferred: 'Release Anime' },
      episodes: 12,
      format: 'TV',
      status: 'FINISHED',
      genres: ['Action'],
    })
  );
  db.saveManga({
    id: sharedMediaId,
    title: { romaji: 'Release Manga', userPreferred: 'Release Manga' },
    chapters: 1,
    volumes: 1,
    format: 'ONE_SHOT',
    status: 'FINISHED',
    genres: ['Drama'],
  });
  assert.equal(
    lists.saveMyAnimeEntry(session, sharedMediaId, {
      status: 'completed',
      progress: 12,
      score: 8,
      notes: 'Anime backup smoke',
    }).ok,
    true
  );
  assert.equal(
    lists.saveMyMangaEntry(session, sharedMediaId, {
      status: 'completed',
      progress: 1,
      volumeProgress: 1,
      score: 9,
      notes: 'Manga backup smoke',
    }).ok,
    true
  );

  const exportedBackup = await backup.exportBackup(session, { themeAccent: 'violet' });
  assert.ok(exportedBackup.data.entries[String(sharedMediaId)]);
  assert.ok(exportedBackup.data.mangaEntries[String(sharedMediaId)]);
  assert.equal(lists.removeMyAnimeEntry(session, sharedMediaId).ok, true);
  assert.equal(lists.removeMyMangaEntry(session, sharedMediaId).ok, true);
  const restoredBackup = await backup.importBackup(session, exportedBackup, () => undefined);
  assert.equal(restoredBackup.ok, true);
  assert.equal(restoredBackup.animeImported, 1);
  assert.equal(restoredBackup.mangaImported, 1);
  assert.equal(db.getUserAnimeList(session.user.id).length, 1);
  assert.equal(db.getUserMangaList(session.user.id).length, 1);

  db.upsertAniListAccount({
    userId: linkedRegistration.user.id,
    anilistUserId: 101,
    anilistUsername: 'release_al',
    originalAniListUsername: 'release_al',
    accessToken: 'smoke-token',
  });
  db.upsertMalAccount({
    userId: linkedRegistration.user.id,
    malUserId: 202,
    malUsername: 'release_mal',
    originalMalUsername: 'release_mal',
    accessToken: 'smoke-token',
  });

  const sync = require('../sync');
  const ambiguousStatus = sync.getSyncStatus(linkedRegistration.user.id);
  assert.equal(ambiguousStatus.ok, false);
  assert.equal(ambiguousStatus.linked, false);
  assert.match(ambiguousStatus.message, /Unlink one/);

  db.deleteMalAccountByUserId(linkedRegistration.user.id);
  const exclusiveStatus = sync.getSyncStatus(linkedRegistration.user.id);
  assert.equal(exclusiveStatus.ok, true);
  assert.equal(exclusiveStatus.provider, 'anilist');

  console.log(
    `Fresh database, mixed-ID backup/restore, authentication, and provider invariants passed (${path.basename(databasePath)}).`
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
