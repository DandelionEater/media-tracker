const anilist = require('./anilist');
const mal = require('./mal');
const { resolveMalAnimeIdForAnime } = require('./malMapping');
const { getFreshMalAccountByUserId, withFreshMalAccount } = require('./malTokens');
const {
  getAppSetting,
  setAppSetting,
  getAniListAccountByUserId,
  getMalAccountByUserId,
  getAnimeExternalIdByAnimeId,
  getDueSyncQueueJobs,
  getSyncQueueItems,
  getSyncQueueCount,
  getSyncHistoryItems,
  markSyncQueueJobFailed,
  deleteSyncQueueJob,
  insertSyncHistory,
} = require('./db');

const AUTO_SYNC_KEY_PREFIX = 'sync.autoEnabled.user.';
const AUTO_SYNC_DELAY_MS = 15 * 1000;

let autoSyncTimer = null;
const runningUsers = new Set();

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

function scheduleAutoSync(userId) {
  if (!getAutoSyncEnabled(userId)) {
    return;
  }

  if (autoSyncTimer) {
    clearTimeout(autoSyncTimer);
  }

  autoSyncTimer = setTimeout(() => {
    runSyncForUser(userId, { limit: 10 }).catch((error) => {
      console.error('Auto sync error:', error);
    });
  }, AUTO_SYNC_DELAY_MS);
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

  const linkedAniListAccount = getAniListAccountByUserId(userId);
  const linkedMalAccount = await getFreshMalAccountByUserId(userId);

  if (!linkedAniListAccount?.access_token && !linkedMalAccount?.access_token) {
    return {
      ok: false,
      message: 'Link an AniList or MyAnimeList account before syncing.',
      synced: 0,
      failed: 0,
      pending: getSyncQueueCount(userId),
    };
  }

  runningUsers.add(userId);

  try {
    const jobs = getDueSyncQueueJobs(userId, options.limit ?? 50);
    let synced = 0;
    let failed = 0;

    for (const job of jobs) {
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
          continue;
        }

        if (job.operation === 'upsert_mal_entry') {
          if (!linkedMalAccount?.access_token) {
            throw new Error('Link a MyAnimeList account before syncing this entry.');
          }

          let malAnimeId =
            job.payload.malAnimeId ||
            getAnimeExternalIdByAnimeId('mal', job.anime_id)?.external_id;

          await withFreshMalAccount(userId, async (account) => {
            if (!account?.access_token) {
              throw new Error('Link a MyAnimeList account before syncing this entry.');
            }

            if (!malAnimeId) {
              malAnimeId = await resolveMalAnimeIdForAnime(job.anime_id, account.access_token);
            }

            if (!malAnimeId) {
              throw new Error('No MyAnimeList ID mapping exists for this anime.');
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
          continue;
        }

        if (job.operation === 'delete_mal_entry') {
          if (!linkedMalAccount?.access_token) {
            throw new Error('Link a MyAnimeList account before syncing this deletion.');
          }

          let malAnimeId =
            job.payload.malAnimeId ||
            getAnimeExternalIdByAnimeId('mal', job.anime_id)?.external_id;

          await withFreshMalAccount(userId, async (account) => {
            if (!account?.access_token) {
              throw new Error('Link a MyAnimeList account before syncing this deletion.');
            }

            if (!malAnimeId) {
              malAnimeId = await resolveMalAnimeIdForAnime(job.anime_id, account.access_token);
            }

            if (!malAnimeId) {
              throw new Error('No MyAnimeList ID mapping exists for this anime.');
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
          continue;
        }

        throw new Error(`Unsupported sync operation: ${job.operation}`);
      } catch (error) {
        const message = error.message || 'Failed to sync entry.';
        markSyncQueueJobFailed(job.id, message, getBackoffDate(job.attempts));
        insertSyncHistory({
          userId,
          animeId: job.anime_id,
          animeTitle: job.animeTitle,
          operation: job.operation,
          changedFields: job.changedFields,
          status: 'failed',
          message,
        });
        failed += 1;
      }
    }

    const pending = getSyncQueueCount(userId);
    const ok = failed === 0;

    return {
      ok,
      synced,
      failed,
      pending,
      message:
        synced === 0 && failed === 0
          ? 'No sync changes are waiting.'
          : failed > 0
            ? `Synced ${synced}, ${failed} waiting to retry.`
            : `Synced ${synced} change${synced === 1 ? '' : 's'}.`,
    };
  } finally {
    runningUsers.delete(userId);
  }
}

function getSyncStatus(userId) {
  const linkedAniListAccount = getAniListAccountByUserId(userId);
  const linkedMalAccount = getMalAccountByUserId(userId);
  const provider = linkedAniListAccount ? 'anilist' : linkedMalAccount ? 'mal' : null;
  const providerLabel =
    provider === 'anilist' ? 'AniList' : provider === 'mal' ? 'MyAnimeList' : null;

  return {
    ok: true,
    linked: Boolean(provider),
    provider,
    providerLabel,
    autoSyncEnabled: getAutoSyncEnabled(userId),
    pendingCount: getSyncQueueCount(userId),
  };
}

function getSyncActivity(userId) {
  return {
    ok: true,
    pending: getSyncQueueItems(userId, 50),
    completed: getSyncHistoryItems(userId, 'completed', 50),
    failed: getSyncHistoryItems(userId, 'failed', 50),
  };
}

module.exports = {
  buildAniListPayload,
  buildAniListDeletePayload,
  buildMalPayload,
  buildMalDeletePayload,
  scheduleAutoSync,
  runSyncForUser,
  getSyncStatus,
  getSyncActivity,
  getAutoSyncEnabled,
  setAutoSyncEnabled,
};
