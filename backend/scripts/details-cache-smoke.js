const assert = require('assert/strict');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

async function closeServer(server) {
  if (!server?.listening) return;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function animeDetails(id, title) {
  return {
    id,
    isAdult: false,
    title: { romaji: title, userPreferred: title },
    coverImage: { large: `https://images.invalid/anime-${id}.jpg` },
    genres: ['Drama'],
    studios: { nodes: [] },
    tags: [],
    staff: { edges: [] },
    characters: { edges: [] },
    relations: { edges: [] },
    recommendations: { nodes: [] },
    externalLinks: [],
    streamingEpisodes: [],
    startDate: { year: 2020, month: 1, day: 1 },
    franchiseStartDate: { year: 2020, month: 1, day: 1 },
  };
}

function mangaDetails(id, title) {
  return {
    id,
    type: 'MANGA',
    isAdult: false,
    title: { romaji: title, userPreferred: title },
    coverImage: { large: `https://images.invalid/manga-${id}.jpg` },
    genres: ['Drama'],
    tags: [],
    recommendations: { nodes: [] },
  };
}

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'seenary-details-cache-'));
  let apiServer;
  let dbModule;

  try {
    process.env.DATABASE_PATH = path.join(tempRoot, 'media.sqlite');
    process.env.PORT = '0';
    process.env.DB_BACKUP_INTERVAL_HOURS = '0';
    process.env.ANILIST_CLIENT_ID = 'details-cache-test';
    process.env.ANILIST_CLIENT_SECRET = 'details-cache-test';

    const anilist = require('../anilist');
    const freshAnime = animeDetails(101, 'Fresh anime');
    const freshManga = mangaDetails(202, 'Fresh manga');
    let franchiseTraversalCalls = 0;

    anilist.getAnimeDetails = async (_id, options = {}) =>
      options.includeFranchiseStartDate === false
        ? { ...freshAnime, franchiseStartDate: undefined }
        : freshAnime;
    anilist.findAnimeSeriesStartDate = async () => {
      franchiseTraversalCalls += 1;
      return freshAnime.franchiseStartDate;
    };
    anilist.getMangaDetails = async () => freshManga;

    dbModule = require('../db');
    const { server } = require('../server');
    apiServer = server;
    if (!server.listening) {
      await new Promise((resolve) => server.once('listening', resolve));
    }

    const address = server.address();
    const apiOrigin = `http://127.0.0.1:${address.port}`;
    const requestDetails = async (mediaType, id) => {
      const response = await fetch(`${apiOrigin}/rpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'getMediaDetails', args: [mediaType, id] }),
      });
      return { response, payload: await response.json() };
    };

    const animeFreshResult = await requestDetails('ANIME', freshAnime.id);
    assert.equal(animeFreshResult.response.status, 200);
    assert.equal(animeFreshResult.payload.franchiseStartDate, undefined);
    assert.equal(franchiseTraversalCalls, 0);
    assert.equal(dbModule.getAnimeById(freshAnime.id).title_preferred, 'Fresh anime');

    const franchiseResult = await fetch(`${apiOrigin}/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'getAnimeFranchiseStartDate', args: [freshAnime.id] }),
    });
    const franchisePayload = await franchiseResult.json();
    assert.equal(franchiseResult.status, 200);
    assert.deepEqual(franchisePayload.franchiseStartDate, freshAnime.franchiseStartDate);
    assert.equal(franchiseTraversalCalls, 1);
    assert.equal(dbModule.getAnimeById(freshAnime.id).franchise_start_resolved, 1);

    const cachedFranchiseResult = await fetch(`${apiOrigin}/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'getAnimeFranchiseStartDate', args: [freshAnime.id] }),
    });
    assert.equal(cachedFranchiseResult.status, 200);
    assert.equal(franchiseTraversalCalls, 1);

    const mangaFreshResult = await requestDetails('MANGA', freshManga.id);
    assert.equal(mangaFreshResult.response.status, 200);
    assert.equal(dbModule.getMangaById(freshManga.id).details.title.userPreferred, 'Fresh manga');

    const outage = new Error('AniList is temporarily unavailable.');
    outage.status = 503;
    anilist.getAnimeDetails = async () => {
      throw outage;
    };
    anilist.getMangaDetails = async () => {
      throw outage;
    };

    const animeCachedResult = await requestDetails('ANIME', freshAnime.id);
    assert.equal(animeCachedResult.response.status, 200);
    assert.equal(animeCachedResult.payload.title.userPreferred, 'Fresh anime');

    const mangaCachedResult = await requestDetails('MANGA', freshManga.id);
    assert.equal(mangaCachedResult.response.status, 200);
    assert.equal(mangaCachedResult.payload.title.userPreferred, 'Fresh manga');

    const uncachedResult = await requestDetails('ANIME', 999);
    assert.equal(uncachedResult.response.status, 503);
    assert.equal(
      uncachedResult.payload.message,
      'AniList is unavailable and no cached anime details are available.'
    );

    console.log('Details cache fallback checks passed.');
  } finally {
    await closeServer(apiServer);
    dbModule?.db?.close();

    const resolvedTempRoot = path.resolve(tempRoot);
    const resolvedOsTemp = path.resolve(os.tmpdir());
    if (
      resolvedTempRoot.startsWith(`${resolvedOsTemp}${path.sep}`) &&
      path.basename(resolvedTempRoot).startsWith('seenary-details-cache-')
    ) {
      fs.rmSync(resolvedTempRoot, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  const isNativeAbiMismatch =
    error?.code === 'ERR_DLOPEN_FAILED' &&
    /NODE_MODULE_VERSION|different Node\.js version/i.test(String(error?.message || ''));

  if (!process.versions.electron && isNativeAbiMismatch) {
    const result = spawnSync(require('electron'), [__filename], {
      stdio: 'inherit',
      env: process.env,
    });
    process.exit(result.status ?? 1);
  }

  console.error(error);
  process.exitCode = 1;
});
