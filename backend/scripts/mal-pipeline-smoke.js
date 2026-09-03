const assert = require('assert');

function mockModule(relativePath, exports) {
  require.cache[require.resolve(relativePath)] = {
    id: require.resolve(relativePath),
    filename: require.resolve(relativePath),
    loaded: true,
    exports,
  };
}

function buildMedia(idMal, type) {
  return {
    id: idMal + 10_000,
    idMal,
    type,
    title: { userPreferred: `${type} ${idMal}` },
    coverImage: { large: null },
  };
}

async function waitForJob(job, expectedStatus) {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    if (job.status === expectedStatus) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(job.status, expectedStatus);
}

async function testJobs() {
  const { createMalJob, cancelMalJob } = require('../malJobs');
  const first = createMalJob({
    userId: 7,
    key: 'pull',
    run: async (context) => {
      context.report({ stage: 'mapping', current: 1, total: 2 });
      await new Promise((resolve) => setTimeout(resolve, 20));
      context.throwIfCancelled();
      return { ok: true };
    },
  });
  const duplicate = createMalJob({ userId: 7, key: 'pull', run: async () => ({ ok: true }) });
  assert.equal(duplicate.id, first.id, 'active pull jobs should deduplicate per user');
  await waitForJob(first, 'complete');
  assert.equal(first.result.ok, true);

  const cancelled = createMalJob({
    userId: 7,
    key: 'preview:test',
    run: async (context) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      context.throwIfCancelled();
      return { ok: true };
    },
  });
  assert.equal(cancelMalJob(cancelled.id, 7), true);
  await waitForJob(cancelled, 'cancelled');
}

async function testBatchMapping() {
  const animeBatchCalls = [];
  const mangaBatchCalls = [];
  mockModule('../anilist', {
    getMediaByMalIds: async (ids, type) => {
      (type === 'MANGA' ? mangaBatchCalls : animeBatchCalls).push([...ids]);
      return ids.map((id) => buildMedia(id, type));
    },
    searchAnime: async () => {
      throw new Error('exact MAL IDs should not fall back to title search');
    },
    getMangaDetailsByMalId: async () => {
      throw new Error('exact MAL IDs should not require individual Manga lookups');
    },
  });
  const animeByExternalId = new Map();
  const mangaByExternalId = new Map();
  mockModule('../db', {
    getAnimeById: () => null,
    getAnimeExternalId: (_provider, id) => animeByExternalId.get(String(id)) || null,
    saveAnimeSummary: () => undefined,
    upsertAnimeExternalId: ({ externalId, animeId }) =>
      animeByExternalId.set(String(externalId), { anime_id: animeId }),
    getMangaById: () => null,
    getMangaExternalId: (_provider, id) => mangaByExternalId.get(String(id)) || null,
    saveManga: () => undefined,
    upsertMangaExternalId: ({ externalId, mangaId }) =>
      mangaByExternalId.set(String(externalId), { manga_id: mangaId }),
    getProviderMappingMiss: () => null,
    upsertProviderMappingMiss: () => undefined,
    deleteProviderMappingMiss: () => undefined,
  });
  mockModule('../animeMapper', {
    mapAnimeForDb: (media) => media,
    mapDbAnimeForFrontend: (media) => media,
  });
  mockModule('../lists', {
    importAniListEntries: () => ({ ok: true, summary: { skipped: 0 } }),
    importAniListMangaEntries: () => ({ ok: true, summary: { skipped: 0 } }),
  });

  const list = {
    userName: 'tester',
    data: Array.from({ length: 120 }, (_, index) => ({
      node: { id: index + 1, title: `Title ${index + 1}` },
      list_status: { status: 'completed' },
    })),
  };
  const { previewMalImport } = require('../malImport');
  const { previewMalMangaPull } = require('../malMangaImport');
  const anime = await previewMalImport(list);
  const manga = await previewMalMangaPull({
    ...list,
    data: list.data.map((item) => ({
      ...item,
      list_status: { status: 'completed', num_chapters_read: 1 },
    })),
  });
  assert.equal(anime.preview.totalFound, 120);
  assert.equal(manga.localMangaEntries.length, 120);
  assert.equal(animeBatchCalls.length, 1);
  assert.equal(mangaBatchCalls.length, 1);
}

async function testTokenRefreshCoalescing() {
  let account = {
    user_id: 42,
    mal_user_id: 99,
    mal_username: 'tester',
    original_mal_username: 'tester',
    access_token: 'expired',
    refresh_token: 'refresh',
    token_expires_at: Date.now() - 1,
  };
  let refreshCalls = 0;
  const db = require('../db');
  Object.assign(db, {
    getMalAccountByUserId: () => account,
    upsertMalAccount: (next) => {
      account = {
        ...account,
        access_token: next.accessToken,
        refresh_token: next.refreshToken,
        token_expires_at: next.tokenExpiresAt,
      };
    },
  });
  mockModule('../mal', {
    refreshAccessToken: async () => {
      refreshCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { access_token: 'fresh', refresh_token: 'new-refresh', expires_in: 3600 };
    },
  });
  delete require.cache[require.resolve('../malTokens')];
  const { getFreshMalAccountByUserId } = require('../malTokens');

  const refreshed = await Promise.all([
    getFreshMalAccountByUserId(42),
    getFreshMalAccountByUserId(42),
    getFreshMalAccountByUserId(42),
  ]);
  assert.equal(refreshCalls, 1, 'concurrent requests should share one MAL token refresh');
  assert.ok(refreshed.every((item) => item.access_token === 'fresh'));
}

async function run() {
  await testJobs();
  await testBatchMapping();
  await testTokenRefreshCoalescing();
  console.log(
    'MAL background job, deduplication, cancellation, batch mapping, and token refresh checks passed.'
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
