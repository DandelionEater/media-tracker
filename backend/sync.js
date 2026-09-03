const anilist = require('./anilist');
const mal = require('./mal');
const { EventEmitter } = require('events');
const { resolveMalAnimeIdForAnime } = require('./malMapping');
const {
  getFreshMalAccountByUserId,
  isUnauthorizedMalError,
  refreshMalAccountByUserId,
} = require('./malTokens');
const {
  getAppSetting,
  setAppSetting,
  getAniListAccountByUserId,
  getMalAccountByUserId,
  getAnimeExternalIdByAnimeId,
  getUserMangaList,
  enqueueSyncJob,
  getSyncQueueJob,
  upsertAnimeExternalId,
  getDueSyncQueueJobs,
  getSyncQueueItems,
  getSyncQueueCount,
  getSyncHistoryItems,
  hasCompletedSyncHistory,
  markSyncQueueJobFailed,
  restoreSyncQueueJob,
  excludeSyncQueueJob,
  deleteSyncQueueJob,
  insertSyncHistory,
} = require('./db');

const AUTO_SYNC_KEY_PREFIX = 'sync.autoEnabled.user.';
const MAL_MANGA_CLEAR_FIELDS_FIX_KEY_PREFIX = 'sync.malMangaClearFieldsFix.user.';
const AUTO_SYNC_DELAY_MS = 15 * 1000;
const SYNC_FAILURE_LIMIT = 5;

let autoSyncTimer = null;
const runningUsers = new Set();
const statelessRunningUsers = new Set();
const autoSyncEvents = new EventEmitter();

function getAutoSyncKey(userId) {
  return `${AUTO_SYNC_KEY_PREFIX}${userId}`;
}

function getAutoSyncEnabled(userId) {
  const value = getAppSetting(getAutoSyncKey(userId));
  return value === null ? true : value === 'true';
}

function setAutoSyncEnabled(userId, enabled) {
  setAppSetting(getAutoSyncKey(userId), enabled ? 'true' : 'false');
}

function getExclusiveProviderConflict(userId) {
  return Boolean(getAniListAccountByUserId(userId) && getMalAccountByUserId(userId));
}

function buildExclusiveProviderConflict(pendingCount, autoSyncEnabled) {
  return {
    ok: false,
    linked: false,
    provider: null,
    providerLabel: null,
    syncTargetsLabel: 'Choose one provider',
    autoSyncEnabled,
    pendingCount,
    message: 'Both AniList and MyAnimeList are linked. Unlink one before syncing.',
  };
}

function mapStatus(status) {
  switch (status) {
    case 'watching':
      return 'CURRENT';
    case 'planned':
      return 'PLANNING';
    case 'completed':
      return 'COMPLETED';
    case 'paused':
      return 'PAUSED';
    case 'dropped':
      return 'DROPPED';
    default:
      return 'PLANNING';
  }
}

function buildAniListPayload(entry) {
  return {
    mediaId: entry.anime_id,
    status: mapStatus(entry.status),
    progress: entry.progress ?? 0,
    score: entry.score ?? null,
    notes: entry.notes ?? null,
    startedAt: entry.started_at ?? null,
    completedAt: entry.completed_at ?? null,
    repeat: entry.repeat_count ?? 0,
  };
}

function buildAniListMangaPayload(entry) {
  return {
    mediaId: entry.manga_id,
    status: mapStatus(entry.status),
    progress: entry.progress ?? 0,
    progressVolumes: entry.volume_progress ?? entry.volumeProgress ?? 0,
    score: entry.score ?? null,
    notes: entry.notes ?? null,
    startedAt: entry.started_at ?? null,
    completedAt: entry.completed_at ?? null,
    repeat: entry.repeat_count ?? 0,
  };
}

function buildMalPayload(entry, malAnimeId) {
  return {
    malAnimeId: malAnimeId === null || malAnimeId === undefined ? null : Number(malAnimeId),
    status: entry.status,
    progress: entry.progress ?? 0,
    score: entry.score ?? null,
    notes: entry.notes ?? null,
    started_at: entry.started_at ?? null,
    completed_at: entry.completed_at ?? null,
  };
}

function buildMalMangaPayload(entry, malMangaId) {
  return {
    malMangaId: malMangaId === null || malMangaId === undefined ? null : Number(malMangaId),
    status: entry.status,
    progress: entry.progress ?? 0,
    volume_progress: entry.volume_progress ?? entry.volumeProgress ?? 0,
    score: entry.score ?? null,
    notes: entry.notes ?? null,
    started_at: entry.started_at ?? null,
    completed_at: entry.completed_at ?? null,
    repeat_count: entry.repeat_count ?? 0,
    is_rereading: Boolean(entry.is_rereading ?? entry.isRereading),
  };
}

function getEntryTitle(entry) {
  return (
    entry?.title_preferred ||
    entry?.title_english ||
    entry?.title_romaji ||
    entry?.title_native ||
    `${entry?.media_type === 'MANGA' || entry?.manga_id ? 'Manga' : 'Anime'} #${entry?.manga_id ?? entry?.anime_id}`
  );
}

function normalizeTitle(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getLocalEntryTitles(entry) {
  return [
    entry?.title_preferred,
    entry?.title_english,
    entry?.title_romaji,
    entry?.title_native,
    entry?.title,
  ]
    .map((title) => String(title || '').trim())
    .filter(Boolean);
}

function getMalSearchTitleVariants(title) {
  const rawTitle = String(title || '').trim();
  const normalizedTitle = normalizeTitle(rawTitle);
  const words = normalizedTitle.split(' ').filter(Boolean);
  const variants = [
    rawTitle,
    rawTitle.replace(/\([^)]*\)/g, ' ').trim(),
    rawTitle.replace(/[|:;,_!?()[\]{}]+/g, ' ').trim(),
    normalizedTitle,
    words.length > 8 ? words.slice(0, 8).join(' ') : '',
    words.length > 6 ? words.slice(0, 6).join(' ') : '',
  ];

  return [...new Set(variants)].filter((variant) => variant.length >= 2);
}

function scoreMalCandidateForEntry(entry, candidate) {
  const localTitles = new Set(getLocalEntryTitles(entry).map(normalizeTitle));
  const candidateTitles = [
    candidate?.title,
    candidate?.alternative_titles?.en,
    candidate?.alternative_titles?.ja,
    ...(candidate?.alternative_titles?.synonyms || []),
  ]
    .map(normalizeTitle)
    .filter(Boolean);
  let score = 0;

  if (candidateTitles.some((title) => localTitles.has(title))) {
    score += 100;
  } else if (
    candidateTitles.some((candidateTitle) =>
      [...localTitles].some((localTitle) => isStrongTitleContainment(localTitle, candidateTitle))
    )
  ) {
    score += 80;
  } else if (
    candidateTitles.some((candidateTitle) =>
      [...localTitles].some(
        (localTitle) =>
          candidateTitle &&
          localTitle &&
          (candidateTitle.includes(localTitle) || localTitle.includes(candidateTitle))
      )
    )
  ) {
    score += 55;
  }

  const localEpisodes = Number(entry?.episodes);
  const malEpisodes = Number(candidate?.num_episodes);
  if (Number.isFinite(localEpisodes) && localEpisodes > 0 && Number.isFinite(malEpisodes) && malEpisodes > 0) {
    score += localEpisodes === malEpisodes ? 20 : -25;
  }

  const localYear = Number(entry?.season_year);
  const malYear = candidate?.start_date ? Number(String(candidate.start_date).slice(0, 4)) : null;
  if (localYear && malYear) {
    score += localYear === malYear ? 15 : Math.abs(localYear - malYear) === 1 ? 5 : -15;
  }

  return score;
}

function isStrongTitleContainment(localTitle, candidateTitle) {
  if (!localTitle || !candidateTitle || localTitle === candidateTitle) {
    return false;
  }

  const shorter = localTitle.length <= candidateTitle.length ? localTitle : candidateTitle;
  const longer = localTitle.length > candidateTitle.length ? localTitle : candidateTitle;
  const tokenCount = shorter.split(' ').filter(Boolean).length;

  return shorter.length >= 18 && tokenCount >= 4 && longer.includes(shorter);
}

function hasExactMalTitleMatchForEntry(entry, candidate) {
  const localTitles = new Set(getLocalEntryTitles(entry).map(normalizeTitle));
  const candidateTitles = [
    candidate?.title,
    candidate?.alternative_titles?.en,
    candidate?.alternative_titles?.ja,
    ...(candidate?.alternative_titles?.synonyms || []),
  ]
    .map(normalizeTitle)
    .filter(Boolean);

  return candidateTitles.some((title) => localTitles.has(title));
}

function hasStrongMalTitleMatchForEntry(entry, candidate) {
  const localTitles = getLocalEntryTitles(entry).map(normalizeTitle);
  const candidateTitles = [
    candidate?.title,
    candidate?.alternative_titles?.en,
    candidate?.alternative_titles?.ja,
    ...(candidate?.alternative_titles?.synonyms || []),
  ]
    .map(normalizeTitle)
    .filter(Boolean);

  return candidateTitles.some((candidateTitle) =>
    localTitles.some((localTitle) => isStrongTitleContainment(localTitle, candidateTitle))
  );
}

function canUseMalCandidateForEntry(entry, best) {
  if (!best?.candidate) {
    return false;
  }

  if (best.score >= 85) {
    return true;
  }

  if (best.score >= 75 && hasExactMalTitleMatchForEntry(entry, best.candidate)) {
    return true;
  }

  return best.score >= 65 && hasStrongMalTitleMatchForEntry(entry, best.candidate);
}

function isInvalidMalQueryError(error) {
  const rawMessage = String(error?.data?.message || error?.message || '').toLowerCase();
  return rawMessage === 'invalid q' || rawMessage.includes('rejected the title search query');
}

async function resolveMalAnimeIdForLocalEntry(entry, accessToken) {
  const directId = entry?.external_ids?.mal;
  if (directId) {
    upsertAnimeExternalId({
      provider: 'mal',
      externalId: directId,
      animeId: entry.anime_id,
      submittedByUserId: entry.submitted_by_user_id,
    });
    return String(directId);
  }

  const existing = getAnimeExternalIdByAnimeId('mal', entry.anime_id);
  if (existing?.external_id) {
    return existing.external_id;
  }

  let best = null;
  const seen = new Set();

  for (const title of getLocalEntryTitles(entry).flatMap(getMalSearchTitleVariants)) {
    let candidates = [];

    try {
      candidates = await mal.searchAnime(title, { accessToken, limit: 25 });
    } catch (error) {
      if (!isInvalidMalQueryError(error)) {
        throw error;
      }
      continue;
    }

    for (const candidate of candidates) {
      if (!candidate?.id || seen.has(String(candidate.id))) {
        continue;
      }

      seen.add(String(candidate.id));
      const score = scoreMalCandidateForEntry(entry, candidate);
      if (!best || score > best.score) {
        best = { candidate, score };
      }
    }
  }

  if (!canUseMalCandidateForEntry(entry, best)) {
    return null;
  }

  upsertAnimeExternalId({
    provider: 'mal',
    externalId: best.candidate.id,
    animeId: entry.anime_id,
    submittedByUserId: entry.submitted_by_user_id,
  });

  return String(best.candidate.id);
}

async function resolveMalMangaIdForLocalEntry(entry, accessToken) {
  const directId = entry?.external_ids?.mal || entry?.details?.idMal;
  if (directId) return String(directId);

  let best = null;
  const seen = new Set();

  for (const title of getLocalEntryTitles(entry).flatMap(getMalSearchTitleVariants)) {
    let candidates = [];
    try {
      candidates = await mal.searchManga(title, { accessToken, limit: 25 });
    } catch (error) {
      if (!isInvalidMalQueryError(error)) throw error;
      continue;
    }

    for (const candidate of candidates) {
      if (!candidate?.id || seen.has(String(candidate.id))) continue;
      seen.add(String(candidate.id));
      const score = scoreMalCandidateForEntry(entry, candidate);
      if (!best || score > best.score) best = { candidate, score };
    }
  }

  return canUseMalCandidateForEntry(entry, best) ? String(best.candidate.id) : null;
}

function buildAniListDeletePayload(entry, anilistUserId) {
  return {
    mediaId: entry.anime_id,
    userId: anilistUserId,
  };
}

function buildMalDeletePayload(entry, malAnimeId) {
  return {
    malAnimeId: malAnimeId === null || malAnimeId === undefined ? null : Number(malAnimeId),
  };
}

function buildAniListMangaDeletePayload(entry, anilistUserId) {
  return { mediaId: entry.manga_id, mediaType: 'MANGA', userId: anilistUserId };
}

function buildMalMangaDeletePayload(entry, malMangaId) {
  return {
    malMangaId: malMangaId === null || malMangaId === undefined ? null : Number(malMangaId),
  };
}

function cleanPayload(payload) {
  return {
    ...payload,
    score: payload.score === null ? 0 : payload.score,
    notes: payload.notes === null ? '' : payload.notes,
    startedAt: payload.startedAt === null ? { year: 0, month: 0, day: 0 } : payload.startedAt,
    completedAt:
      payload.completedAt === null ? { year: 0, month: 0, day: 0 } : payload.completedAt,
  };
}

function getBackoffDate(attempts) {
  const seconds = attempts <= 0 ? 30 : attempts === 1 ? 120 : attempts === 2 ? 300 : 900;
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function createMalOperationRunner(userId, initialAccount) {
  let account = initialAccount;

  return async function runMalOperation(operation) {
    try {
      return await operation(account);
    } catch (error) {
      if (!isUnauthorizedMalError(error)) {
        throw error;
      }

      account = await refreshMalAccountByUserId(userId);
      return await operation(account);
    }
  };
}

function createMalMappingCache() {
  const cache = new Map();

  return {
    get(animeId) {
      return cache.get(String(animeId));
    },
    set(animeId, malAnimeId) {
      if (malAnimeId) {
        cache.set(String(animeId), String(malAnimeId));
      }
    },
  };
}

async function forEachWithConcurrency(items, concurrency, worker) {
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), Math.max(1, items.length)) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        await worker(items[index], index);
      }
    }
  );
  await Promise.all(workers);
}

function scheduleAutoSync(userId) {
  if (!getAutoSyncEnabled(userId)) {
    return;
  }

  if (autoSyncTimer) {
    clearTimeout(autoSyncTimer);
  }

  autoSyncTimer = setTimeout(async () => {
    try {
      const result = await runSyncForUser(userId, { limit: 10 });
      if ((result.synced ?? 0) > 0 || (result.failed ?? 0) > 0 || (!result.ok && result.pending > 0)) {
        autoSyncEvents.emit('complete', result);
      }
    } catch (error) {
      console.error('Auto sync error:', error);
    }
  }, AUTO_SYNC_DELAY_MS);
}

function buildInitialChangedFields(entry) {
  return [
    { field: 'status', from: null, to: entry.status ?? 'planned' },
    { field: 'progress', from: null, to: entry.progress ?? 0 },
    { field: 'volumeProgress', from: null, to: entry.volume_progress ?? 0 },
    { field: 'score', from: null, to: entry.score ?? null },
  ].filter((change) => change.from !== change.to);
}

function ensureExistingMangaSyncJobs(userId) {
  const linkedAniListAccount = getAniListAccountByUserId(userId);
  const linkedMalAccount = getMalAccountByUserId(userId);
  const repairKey = `${MAL_MANGA_CLEAR_FIELDS_FIX_KEY_PREFIX}${userId}`;
  const needsMalClearFieldsRepair = Boolean(
    linkedMalAccount?.access_token && getAppSetting(repairKey) !== '2'
  );
  const malRepairMediaIds = new Set();

  if (needsMalClearFieldsRepair) {
    for (const item of getSyncHistoryItems(userId, 'completed', 5000)) {
      if (item.operation !== 'upsert_mal_manga_entry') continue;
      const clearedScoreOrNotes = item.changedFields?.some(
        (change) =>
          ['score', 'notes'].includes(change?.field) &&
          (change?.to === null || change?.to === '')
      );
      if (clearedScoreOrNotes && item.manga_id) {
        malRepairMediaIds.add(Number(item.manga_id));
      }
    }
  }

  for (const entry of getUserMangaList(userId)) {
    const changedFields = buildInitialChangedFields(entry);

    if (
      linkedAniListAccount?.access_token &&
      !getSyncQueueJob(userId, entry.manga_id, 'upsert_anilist_manga_entry', 'MANGA') &&
      !hasCompletedSyncHistory(
        userId,
        'MANGA',
        entry.manga_id,
        'upsert_anilist_manga_entry'
      )
    ) {
      enqueueSyncJob({
        userId,
        mangaId: entry.manga_id,
        mediaType: 'MANGA',
        operation: 'upsert_anilist_manga_entry',
        payload: buildAniListMangaPayload(entry),
        changedFields,
      });
    }

    if (
      linkedMalAccount?.access_token &&
      !getSyncQueueJob(userId, entry.manga_id, 'upsert_mal_manga_entry', 'MANGA') &&
      (malRepairMediaIds.has(entry.manga_id) ||
        !hasCompletedSyncHistory(userId, 'MANGA', entry.manga_id, 'upsert_mal_manga_entry'))
    ) {
      enqueueSyncJob({
        userId,
        mangaId: entry.manga_id,
        mediaType: 'MANGA',
        operation: 'upsert_mal_manga_entry',
        payload: buildMalMangaPayload(entry, entry.details?.idMal ?? null),
        changedFields,
      });
    }
  }

  if (needsMalClearFieldsRepair) {
    setAppSetting(repairKey, '2');
  }
}

async function runSyncForUser(userId, options = {}) {
  if (runningUsers.has(userId)) {
    return {
      ok: false,
      message: 'Sync is already running.',
      synced: 0,
      failed: 0,
      pending: getSyncQueueCount(userId),
    };
  }


  if (getExclusiveProviderConflict(userId)) {
    return {
      ok: false,
      message: 'Both AniList and MyAnimeList are linked. Unlink one before syncing.',
      synced: 0,
      failed: 0,
      pending: getSyncQueueCount(userId),
    };
  }

  runningUsers.add(userId);

  try {
    ensureExistingMangaSyncJobs(userId);
    const jobLimit = options.limit ?? 50;
    const jobs = getDueSyncQueueJobs(userId, jobLimit, {
      includeFutureRetries: Boolean(options.forceRetry),
    });
    const linkedAniListAccount = getAniListAccountByUserId(userId);
    const needsMalAccount =
      !linkedAniListAccount?.access_token ||
      jobs.some((job) => String(job.operation || '').includes('_mal_'));
    const linkedMalAccount = needsMalAccount
      ? await getFreshMalAccountByUserId(userId)
      : null;

    if (!linkedAniListAccount?.access_token && !linkedMalAccount?.access_token) {
      return {
        ok: false,
        message: 'Link an AniList or MyAnimeList account before syncing.',
        synced: 0,
        failed: 0,
        pending: getSyncQueueCount(userId),
      };
    }

    let synced = 0;
    let failed = 0;
    let excluded = 0;
    const syncedItems = [];
    const emitProgress =
      typeof options.onProgress === 'function' ? options.onProgress : () => {};
    const runMalOperation = linkedMalAccount?.access_token
      ? createMalOperationRunner(userId, linkedMalAccount)
      : null;
    const malMappingCache = createMalMappingCache();

    async function resolveMalAnimeIdForJob(job) {
      const cached = malMappingCache.get(job.anime_id);
      if (cached) {
        return cached;
      }

      let malAnimeId =
        job.payload.malAnimeId ||
        getAnimeExternalIdByAnimeId('mal', job.anime_id)?.external_id;

      if (!malAnimeId && runMalOperation) {
        malAnimeId = await runMalOperation(async (account) => {
          if (!account?.access_token) {
            throw new Error('Link a MyAnimeList account before syncing this entry.');
          }

          return await resolveMalAnimeIdForAnime(job.anime_id, account.access_token, {
            submittedByUserId: userId,
          });
        });
      }

      malMappingCache.set(job.anime_id, malAnimeId);
      return malAnimeId;
    }

    async function resolveMalMangaIdForJob(job) {
      const cached = malMappingCache.get(`MANGA:${job.manga_id}`);
      if (cached) return cached;

      let malMangaId = job.payload.malMangaId;
      if (!malMangaId && runMalOperation) {
        malMangaId = await runMalOperation(async (account) => {
          if (!account?.access_token) {
            throw new Error('Link a MyAnimeList account before syncing this Manga.');
          }
          return await resolveMalMangaIdForLocalEntry(job, account.access_token);
        });
      }

      malMappingCache.set(`MANGA:${job.manga_id}`, malMangaId);
      return malMangaId;
    }

    emitProgress({
      operation: 'manual-sync',
      stage: jobs.length ? 'processing' : 'complete',
      label: jobs.length
        ? `Syncing 0 of ${jobs.length} queued changes...`
        : 'No queued changes are ready.',
      current: 0,
      total: jobs.length,
    });

    for (const [index, job] of jobs.entries()) {
      emitProgress({
        operation: 'manual-sync',
        stage: 'processing',
        label: `Syncing ${index + 1} of ${jobs.length}: ${job.animeTitle}`,
        current: index,
        total: jobs.length,
      });

      try {
        if (job.operation === 'upsert_anilist_entry') {
          if (!linkedAniListAccount?.access_token) {
            throw new Error('Link an AniList account before syncing this entry.');
          }

          await anilist.saveMediaListEntry(
            linkedAniListAccount.access_token,
            cleanPayload(job.payload)
          );
          deleteSyncQueueJob(job.id);
          insertSyncHistory({
            userId,
            animeId: job.anime_id,
            animeTitle: job.animeTitle,
            operation: job.operation,
            changedFields: job.changedFields,
            status: 'completed',
            message: 'Synced to AniList.',
          });
          synced += 1;
          syncedItems.push({ animeTitle: job.animeTitle, provider: 'AniList' });
          continue;
        }

        if (job.operation === 'delete_anilist_entry') {
          if (!linkedAniListAccount?.access_token || !linkedAniListAccount?.anilist_user_id) {
            throw new Error('Link an AniList account before syncing this deletion.');
          }

          await anilist.deleteMediaListEntry(linkedAniListAccount.access_token, {
            ...job.payload,
            mediaId: job.anime_id,
            userId: linkedAniListAccount.anilist_user_id,
          });
          deleteSyncQueueJob(job.id);
          insertSyncHistory({
            userId,
            animeId: job.anime_id,
            animeTitle: job.animeTitle,
            operation: job.operation,
            changedFields: job.changedFields,
            status: 'completed',
            message: 'Deleted from AniList.',
          });
          synced += 1;
          syncedItems.push({ animeTitle: job.animeTitle, provider: 'AniList' });
          continue;
        }

        if (job.operation === 'upsert_mal_entry') {
          if (!runMalOperation) {
            throw new Error('Link a MyAnimeList account before syncing this entry.');
          }

          const malAnimeId = await resolveMalAnimeIdForJob(job);

          if (!malAnimeId) {
            throw new Error('No MyAnimeList ID mapping exists for this anime.');
          }

          await runMalOperation(async (account) => {
            if (!account?.access_token) {
              throw new Error('Link a MyAnimeList account before syncing this entry.');
            }

            return await mal.saveAnimeListStatus(account.access_token, malAnimeId, job.payload);
          });
          deleteSyncQueueJob(job.id);
          insertSyncHistory({
            userId,
            animeId: job.anime_id,
            animeTitle: job.animeTitle,
            operation: job.operation,
            changedFields: job.changedFields,
            status: 'completed',
            message: 'Synced to MyAnimeList.',
          });
          synced += 1;
          syncedItems.push({ animeTitle: job.animeTitle, provider: 'MyAnimeList' });
          continue;
        }

        if (job.operation === 'delete_mal_entry') {
          if (!runMalOperation) {
            throw new Error('Link a MyAnimeList account before syncing this deletion.');
          }

          const malAnimeId = await resolveMalAnimeIdForJob(job);

          if (!malAnimeId) {
            throw new Error('No MyAnimeList ID mapping exists for this anime.');
          }

          await runMalOperation(async (account) => {
            if (!account?.access_token) {
              throw new Error('Link a MyAnimeList account before syncing this deletion.');
            }

            return await mal.deleteAnimeListStatus(account.access_token, malAnimeId);
          });
          deleteSyncQueueJob(job.id);
          insertSyncHistory({
            userId,
            animeId: job.anime_id,
            animeTitle: job.animeTitle,
            operation: job.operation,
            changedFields: job.changedFields,
            status: 'completed',
            message: 'Deleted from MyAnimeList.',
          });
          synced += 1;
          syncedItems.push({ animeTitle: job.animeTitle, provider: 'MyAnimeList' });
          continue;
        }

        if (job.operation === 'upsert_anilist_manga_entry') {
          if (!linkedAniListAccount?.access_token) {
            throw new Error('Link an AniList account before syncing this Manga.');
          }
          await anilist.saveMediaListEntry(
            linkedAniListAccount.access_token,
            cleanPayload(job.payload)
          );
          deleteSyncQueueJob(job.id);
          insertSyncHistory({
            userId,
            mangaId: job.manga_id,
            mediaType: 'MANGA',
            animeTitle: job.animeTitle,
            operation: job.operation,
            changedFields: job.changedFields,
            status: 'completed',
            message: 'Synced Manga to AniList.',
          });
          synced += 1;
          syncedItems.push({
            animeTitle: job.animeTitle,
            mediaType: 'MANGA',
            provider: 'AniList',
          });
          continue;
        }

        if (job.operation === 'delete_anilist_manga_entry') {
          if (!linkedAniListAccount?.access_token || !linkedAniListAccount?.anilist_user_id) {
            throw new Error('Link an AniList account before syncing this Manga deletion.');
          }
          await anilist.deleteMediaListEntry(linkedAniListAccount.access_token, {
            ...job.payload,
            mediaId: job.manga_id,
            mediaType: 'MANGA',
            userId: linkedAniListAccount.anilist_user_id,
          });
          deleteSyncQueueJob(job.id);
          insertSyncHistory({
            userId,
            mangaId: job.manga_id,
            mediaType: 'MANGA',
            animeTitle: job.animeTitle,
            operation: job.operation,
            changedFields: job.changedFields,
            status: 'completed',
            message: 'Deleted Manga from AniList.',
          });
          synced += 1;
          syncedItems.push({
            animeTitle: job.animeTitle,
            mediaType: 'MANGA',
            provider: 'AniList',
          });
          continue;
        }

        if (job.operation === 'upsert_mal_manga_entry') {
          if (!runMalOperation) {
            throw new Error('Link a MyAnimeList account before syncing this Manga.');
          }
          const malMangaId = await resolveMalMangaIdForJob(job);
          if (!malMangaId) {
            throw new Error('No MyAnimeList ID mapping exists for this Manga.');
          }
          await runMalOperation(async (account) =>
            await mal.saveMangaListStatus(account.access_token, malMangaId, job.payload)
          );
          deleteSyncQueueJob(job.id);
          insertSyncHistory({
            userId,
            mangaId: job.manga_id,
            mediaType: 'MANGA',
            animeTitle: job.animeTitle,
            operation: job.operation,
            changedFields: job.changedFields,
            status: 'completed',
            message: 'Synced Manga to MyAnimeList.',
          });
          synced += 1;
          syncedItems.push({
            animeTitle: job.animeTitle,
            mediaType: 'MANGA',
            provider: 'MyAnimeList',
          });
          continue;
        }

        if (job.operation === 'delete_mal_manga_entry') {
          if (!runMalOperation) {
            throw new Error('Link a MyAnimeList account before syncing this Manga deletion.');
          }
          const malMangaId = await resolveMalMangaIdForJob(job);
          if (!malMangaId) {
            throw new Error('No MyAnimeList ID mapping exists for this Manga.');
          }
          await runMalOperation(async (account) =>
            await mal.deleteMangaListStatus(account.access_token, malMangaId)
          );
          deleteSyncQueueJob(job.id);
          insertSyncHistory({
            userId,
            mangaId: job.manga_id,
            mediaType: 'MANGA',
            animeTitle: job.animeTitle,
            operation: job.operation,
            changedFields: job.changedFields,
            status: 'completed',
            message: 'Deleted Manga from MyAnimeList.',
          });
          synced += 1;
          syncedItems.push({
            animeTitle: job.animeTitle,
            mediaType: 'MANGA',
            provider: 'MyAnimeList',
          });
          continue;
        }

        throw new Error(`Unsupported sync operation: ${job.operation}`);
      } catch (error) {
        const message = error.message || 'Failed to sync entry.';
        const blocked = Number(job.attempts || 0) + 1 >= SYNC_FAILURE_LIMIT;
        markSyncQueueJobFailed(job.id, message, getBackoffDate(job.attempts), blocked);
        insertSyncHistory({
          userId,
          animeId: job.anime_id,
          mangaId: job.manga_id,
          mediaType: job.media_type,
          animeTitle: job.animeTitle,
          operation: job.operation,
          changedFields: job.changedFields,
          status: blocked ? 'excluded' : 'failed',
          message: blocked
            ? `${message} Excluded from automatic sync after ${SYNC_FAILURE_LIMIT} failed attempts.`
            : message,
        });
        failed += 1;
        if (blocked) excluded += 1;
      } finally {
        emitProgress({
          operation: 'manual-sync',
          stage: 'processing',
          label: `Processed ${index + 1} of ${jobs.length} queued changes.`,
          current: index + 1,
          total: jobs.length,
        });
      }
    }

    const pending = getSyncQueueCount(userId);
    const ok = failed === 0;
    const noDueJobs = jobs.length === 0 && synced === 0 && failed === 0;

    const result = {
      ok,
      synced,
      failed,
      excluded,
      pending,
      syncedItems,
      message:
        noDueJobs && pending > 0
          ? `${pending} queued sync change${pending === 1 ? '' : 's'} waiting for retry.`
          : synced === 0 && failed === 0
          ? 'No sync changes are waiting.'
          : excluded > 0
            ? `Synced ${synced}; excluded ${excluded} after ${SYNC_FAILURE_LIMIT} failed attempts.`
          : failed > 0
            ? `Synced ${synced}, ${failed} waiting to retry.`
            : `Synced ${synced} change${synced === 1 ? '' : 's'}.`,
    };

    emitProgress({
      operation: 'manual-sync',
      stage: ok ? 'complete' : 'failed',
      label: result.message,
      current: jobs.length,
      total: jobs.length,
    });

    return result;
  } finally {
    runningUsers.delete(userId);
  }
}

function getSyncStatus(userId) {
  const linkedAniListAccount = getAniListAccountByUserId(userId);
  const linkedMalAccount = getMalAccountByUserId(userId);
  if (linkedAniListAccount && linkedMalAccount) {
    return buildExclusiveProviderConflict(
      getSyncQueueCount(userId),
      getAutoSyncEnabled(userId)
    );
  }
  const linkedProviders = [
    ...(linkedAniListAccount ? ['AniList'] : []),
    ...(linkedMalAccount ? ['MyAnimeList'] : []),
  ];
  const provider = linkedAniListAccount ? 'anilist' : linkedMalAccount ? 'mal' : null;
  const providerLabel =
    provider === 'anilist' ? 'AniList' : provider === 'mal' ? 'MyAnimeList' : null;

  return {
    ok: true,
    linked: Boolean(provider),
    provider,
    providerLabel,
    syncTargetsLabel: linkedProviders.join(' and ') || null,
    autoSyncEnabled: getAutoSyncEnabled(userId),
    pendingCount: getSyncQueueCount(userId),
  };
}

function getSyncActivity(userId) {
  const completedHistory = getSyncHistoryItems(userId, 'completed', 100);
  const failedHistory = getSyncHistoryItems(userId, 'failed', 100);
  const partialHistory = getSyncHistoryItems(userId, 'partial', 100);
  const isPullActivity = (item) => String(item?.operation || '').startsWith('pull_');
  const pulled = [...completedHistory, ...failedHistory, ...partialHistory]
    .filter(isPullActivity)
    .sort((left, right) => {
      const dateOrder = String(right.created_at || '').localeCompare(String(left.created_at || ''));
      return dateOrder || Number(right.id || 0) - Number(left.id || 0);
    })
    .slice(0, 100);

  const queueItems = getSyncQueueItems(userId, 100);
  return {
    ok: true,
    pending: queueItems.filter((item) => item.status !== 'blocked').slice(0, 50),
    excluded: queueItems.filter((item) => item.status === 'blocked').map((item) => ({
      ...item,
      status: 'excluded',
      excluded_by: Number(item.attempts || 0) >= SYNC_FAILURE_LIMIT ? 'system' : 'user',
      provider: String(item.operation || '').includes('mal') ? 'mal' : 'anilist',
      message: item.last_error,
    })).slice(0, 50),
    completed: completedHistory.filter((item) => !isPullActivity(item)).slice(0, 50),
    failed: failedHistory.filter((item) => !isPullActivity(item)).slice(0, 50),
    pulled,
  };
}

function restoreSyncExclusion(userId, id) {
  const restored = restoreSyncQueueJob(userId, Number(id));
  return restored
    ? { ok: true, message: 'The entry was restored to the sync queue.' }
    : { ok: false, message: 'This excluded sync entry could not be found.' };
}

function excludeSyncEntry(userId, id) {
  const excluded = excludeSyncQueueJob(userId, Number(id));
  return excluded
    ? { ok: true, message: 'The entry was excluded by the user from automatic sync.' }
    : { ok: false, message: 'Only queued entries with a failed attempt can be excluded.' };
}

function getStatelessSyncStatus(userId, localPendingCount = 0, autoSyncEnabled = true) {
  const linkedAniListAccount = getAniListAccountByUserId(userId);
  const linkedMalAccount = getMalAccountByUserId(userId);
  if (linkedAniListAccount && linkedMalAccount) {
    return buildExclusiveProviderConflict(
      Number(localPendingCount) || 0,
      Boolean(autoSyncEnabled)
    );
  }
  const provider = linkedAniListAccount ? 'anilist' : linkedMalAccount ? 'mal' : null;
  const providerLabel =
    provider === 'anilist' ? 'AniList' : provider === 'mal' ? 'MyAnimeList' : null;
  const linkedProviders = [
    ...(linkedAniListAccount ? ['AniList'] : []),
    ...(linkedMalAccount ? ['MyAnimeList'] : []),
  ];

  return {
    ok: true,
    linked: Boolean(provider),
    provider,
    providerLabel,
    syncTargetsLabel: linkedProviders.join(' and ') || null,
    autoSyncEnabled: Boolean(autoSyncEnabled),
    pendingCount: Number(localPendingCount) || 0,
  };
}

async function runStatelessSyncForUser(userId, payload = {}) {
  if (statelessRunningUsers.has(userId)) {
    return {
      ok: false,
      message: 'Sync is already running.',
      synced: 0,
      failed: 0,
      pending: 0,
      activity: [],
    };
  }


  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  const deletedEntries = Array.isArray(payload.deletedEntries) ? payload.deletedEntries : [];
  const mangaEntries = Array.isArray(payload.mangaEntries) ? payload.mangaEntries : [];
  const deletedMangaEntries = Array.isArray(payload.deletedMangaEntries)
    ? payload.deletedMangaEntries
    : [];
  const linkedAniListAccount = getAniListAccountByUserId(userId);
  const linkedMalAccountRecord = getMalAccountByUserId(userId);
  const activity = [];
  const localChangeCount =
    entries.length + deletedEntries.length + mangaEntries.length + deletedMangaEntries.length;

  if (linkedAniListAccount && linkedMalAccountRecord) {
    return {
      ok: false,
      message: 'Both AniList and MyAnimeList are linked. Unlink one before syncing.',
      synced: 0,
      failed: 0,
      pending: localChangeCount,
      activity,
    };
  }

  const linkedMalAccount = linkedMalAccountRecord
    ? await getFreshMalAccountByUserId(userId)
    : null;

  if (!linkedAniListAccount?.access_token && !linkedMalAccount?.access_token) {
    return {
      ok: false,
      message: 'Link an AniList or MyAnimeList account before syncing.',
      synced: 0,
      failed: 0,
      pending: localChangeCount,
      activity,
    };
  }

  statelessRunningUsers.add(userId);

  try {
    let synced = 0;
    let failed = 0;

    if (linkedAniListAccount?.access_token) {
      for (const entry of entries) {
        try {
          await anilist.saveMediaListEntry(
            linkedAniListAccount.access_token,
            cleanPayload(buildAniListPayload(entry))
          );
          synced += 1;
          activity.push({
            anime_id: entry.anime_id,
            animeTitle: getEntryTitle(entry),
            operation: 'upsert_anilist_entry',
            status: 'completed',
            message: 'Synced to AniList.',
          });
        } catch (error) {
          failed += 1;
          activity.push({
            anime_id: entry.anime_id,
            animeTitle: getEntryTitle(entry),
            operation: 'upsert_anilist_entry',
            status: 'failed',
            message: error.message || 'Failed to sync to AniList.',
          });
        }
      }

      for (const entry of deletedEntries) {
        try {
          await anilist.deleteMediaListEntry(linkedAniListAccount.access_token, {
            mediaId: entry.anime_id,
            mediaType: 'ANIME',
            userId: linkedAniListAccount.anilist_user_id,
          });
          synced += 1;
          activity.push({
            anime_id: entry.anime_id,
            animeTitle: entry.title || `Anime #${entry.anime_id}`,
            operation: 'delete_anilist_entry',
            status: 'completed',
            message: 'Deleted from AniList.',
          });
        } catch (error) {
          failed += 1;
          activity.push({
            anime_id: entry.anime_id,
            animeTitle: entry.title || `Anime #${entry.anime_id}`,
            operation: 'delete_anilist_entry',
            status: 'failed',
            message: error.message || 'Failed to delete from AniList.',
          });
        }
      }

      for (const entry of mangaEntries) {
        try {
          await anilist.saveMediaListEntry(
            linkedAniListAccount.access_token,
            cleanPayload(buildAniListMangaPayload(entry))
          );
          synced += 1;
          activity.push({
            manga_id: entry.manga_id,
            media_type: 'MANGA',
            animeTitle: getEntryTitle(entry),
            operation: 'upsert_anilist_manga_entry',
            status: 'completed',
            message: 'Synced Manga to AniList.',
          });
        } catch (error) {
          failed += 1;
          activity.push({
            manga_id: entry.manga_id,
            media_type: 'MANGA',
            animeTitle: getEntryTitle(entry),
            operation: 'upsert_anilist_manga_entry',
            status: 'failed',
            message: error.message || 'Failed to sync Manga to AniList.',
          });
        }
      }

      for (const entry of deletedMangaEntries) {
        try {
          await anilist.deleteMediaListEntry(linkedAniListAccount.access_token, {
            mediaId: entry.manga_id,
            mediaType: 'MANGA',
            userId: linkedAniListAccount.anilist_user_id,
          });
          synced += 1;
          activity.push({
            manga_id: entry.manga_id,
            media_type: 'MANGA',
            animeTitle: entry.title || `Manga #${entry.manga_id}`,
            operation: 'delete_anilist_manga_entry',
            status: 'completed',
            message: 'Deleted Manga from AniList.',
          });
        } catch (error) {
          failed += 1;
          activity.push({
            manga_id: entry.manga_id,
            media_type: 'MANGA',
            animeTitle: entry.title || `Manga #${entry.manga_id}`,
            operation: 'delete_anilist_manga_entry',
            status: 'failed',
            message: error.message || 'Failed to delete Manga from AniList.',
          });
        }
      }
    }

    if (linkedMalAccount?.access_token) {
      const runMalOperation = createMalOperationRunner(userId, linkedMalAccount);
      const malMappingCache = createMalMappingCache();
      const malMangaMappingCache = createMalMappingCache();

      async function resolveMalAnimeIdForStatelessEntry(entry) {
        const cached = malMappingCache.get(entry.anime_id);
        if (cached) {
          return cached;
        }

        let malAnimeId =
          entry?.external_ids?.mal ||
          getAnimeExternalIdByAnimeId('mal', entry.anime_id)?.external_id;

        if (!malAnimeId) {
          malAnimeId = await runMalOperation(async (account) => {
            return await resolveMalAnimeIdForLocalEntry(
              {
                ...entry,
                submitted_by_user_id: userId,
              },
              account.access_token
            );
          });
        }

        malMappingCache.set(entry.anime_id, malAnimeId);
        return malAnimeId;
      }

      async function resolveMalMangaIdForStatelessEntry(entry) {
        const mediaId = entry.manga_id;
        const cached = malMangaMappingCache.get(mediaId);
        if (cached) return cached;

        let malMangaId = entry?.external_ids?.mal || entry?.details?.idMal;
        if (!malMangaId) {
          malMangaId = await runMalOperation(async (account) =>
            await resolveMalMangaIdForLocalEntry(entry, account.access_token)
          );
        }
        malMangaMappingCache.set(mediaId, malMangaId);
        return malMangaId;
      }

      await forEachWithConcurrency(entries, 3, async (entry) => {
        try {
          const malAnimeId = await resolveMalAnimeIdForStatelessEntry(entry);

          if (!malAnimeId) {
            throw new Error('No MyAnimeList ID mapping exists for this anime.');
          }

          await runMalOperation(async (account) => {
            return await mal.saveAnimeListStatus(
              account.access_token,
              malAnimeId,
              buildMalPayload(entry, malAnimeId)
            );
          });
          synced += 1;
          activity.push({
            anime_id: entry.anime_id,
            animeTitle: getEntryTitle(entry),
            operation: 'upsert_mal_entry',
            status: 'completed',
            message: 'Synced to MyAnimeList.',
          });
        } catch (error) {
          failed += 1;
          activity.push({
            anime_id: entry.anime_id,
            animeTitle: getEntryTitle(entry),
            operation: 'upsert_mal_entry',
            status: 'failed',
            message: error.message || 'Failed to sync to MyAnimeList.',
          });
        }
      });

      await forEachWithConcurrency(deletedEntries, 3, async (entry) => {
        try {
          const malAnimeId = await resolveMalAnimeIdForStatelessEntry(entry);

          if (!malAnimeId) {
            throw new Error('No MyAnimeList ID mapping exists for this anime.');
          }

          await runMalOperation(async (account) => {
            return await mal.deleteAnimeListStatus(account.access_token, malAnimeId);
          });
          synced += 1;
          activity.push({
            anime_id: entry.anime_id,
            animeTitle: entry.title || `Anime #${entry.anime_id}`,
            operation: 'delete_mal_entry',
            status: 'completed',
            message: 'Deleted from MyAnimeList.',
          });
        } catch (error) {
          failed += 1;
          activity.push({
            anime_id: entry.anime_id,
            animeTitle: entry.title || `Anime #${entry.anime_id}`,
            operation: 'delete_mal_entry',
            status: 'failed',
            message: error.message || 'Failed to delete from MyAnimeList.',
          });
        }
      });


      await forEachWithConcurrency(mangaEntries, 3, async (entry) => {
        try {
          const malMangaId = await resolveMalMangaIdForStatelessEntry(entry);
          if (!malMangaId) throw new Error('No MyAnimeList ID mapping exists for this Manga.');

          await runMalOperation(async (account) =>
            await mal.saveMangaListStatus(
              account.access_token,
              malMangaId,
              buildMalMangaPayload(entry, malMangaId)
            )
          );
          synced += 1;
          activity.push({
            manga_id: entry.manga_id,
            media_type: 'MANGA',
            animeTitle: getEntryTitle(entry),
            operation: 'upsert_mal_manga_entry',
            status: 'completed',
            message: 'Synced Manga to MyAnimeList.',
          });
        } catch (error) {
          failed += 1;
          activity.push({
            manga_id: entry.manga_id,
            media_type: 'MANGA',
            animeTitle: getEntryTitle(entry),
            operation: 'upsert_mal_manga_entry',
            status: 'failed',
            message: error.message || 'Failed to sync Manga to MyAnimeList.',
          });
        }
      });

      await forEachWithConcurrency(deletedMangaEntries, 3, async (entry) => {
        try {
          const malMangaId = await resolveMalMangaIdForStatelessEntry(entry);
          if (!malMangaId) throw new Error('No MyAnimeList ID mapping exists for this Manga.');

          await runMalOperation(async (account) =>
            await mal.deleteMangaListStatus(account.access_token, malMangaId)
          );
          synced += 1;
          activity.push({
            manga_id: entry.manga_id,
            media_type: 'MANGA',
            animeTitle: entry.title || `Manga #${entry.manga_id}`,
            operation: 'delete_mal_manga_entry',
            status: 'completed',
            message: 'Deleted Manga from MyAnimeList.',
          });
        } catch (error) {
          failed += 1;
          activity.push({
            manga_id: entry.manga_id,
            media_type: 'MANGA',
            animeTitle: entry.title || `Manga #${entry.manga_id}`,
            operation: 'delete_mal_manga_entry',
            status: 'failed',
            message: error.message || 'Failed to delete Manga from MyAnimeList.',
          });
        }
      });
    }

    const pending = failed;

    return {
      ok: failed === 0,
      synced,
      failed,
      pending,
      activity,
      message:
        synced === 0 && failed === 0
          ? 'No sync changes are waiting.'
          : failed > 0
            ? `Synced ${synced}, ${failed} failed.`
            : `Synced ${synced} change${synced === 1 ? '' : 's'}.`,
    };
  } finally {
    statelessRunningUsers.delete(userId);
  }
}

module.exports = {
  buildAniListPayload,
  buildAniListDeletePayload,
  buildAniListMangaPayload,
  buildAniListMangaDeletePayload,
  buildMalPayload,
  buildMalDeletePayload,
  buildMalMangaPayload,
  buildMalMangaDeletePayload,
  scheduleAutoSync,
  runSyncForUser,
  getSyncStatus,
  getSyncActivity,
  restoreSyncExclusion,
  excludeSyncEntry,
  autoSyncEvents,
  setAutoSyncEnabled,
  getStatelessSyncStatus,
  runStatelessSyncForUser,
};
