const anilist = require('./anilist');
const {
  getAppSetting,
  setAppSetting,
  getAniListAccountByUserId,
  getDueSyncQueueJobs,
  getSyncQueueItems,
  getSyncQueueCount,
  getSyncHistoryItems,
  markSyncQueueJobFailed,
  deleteSyncQueueJob,
  insertSyncHistory,
} = require('./db');

const AUTO_SYNC_KEY_PREFIX = 'sync.anilist.autoEnabled.user.';
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

  const linkedAccount = getAniListAccountByUserId(userId);

  if (!linkedAccount?.access_token) {
    return {
      ok: false,
      message: 'Link an AniList account before syncing.',
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
        if (job.operation !== 'upsert_anilist_entry') {
          throw new Error(`Unsupported sync operation: ${job.operation}`);
        }

        await anilist.saveMediaListEntry(linkedAccount.access_token, cleanPayload(job.payload));
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
          ? 'No AniList changes are waiting.'
          : failed > 0
            ? `Synced ${synced}, ${failed} waiting to retry.`
            : `Synced ${synced} change${synced === 1 ? '' : 's'} to AniList.`,
    };
  } finally {
    runningUsers.delete(userId);
  }
}

function getSyncStatus(userId) {
  return {
    ok: true,
    linked: Boolean(getAniListAccountByUserId(userId)),
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
  scheduleAutoSync,
  runSyncForUser,
  getSyncStatus,
  getSyncActivity,
  getAutoSyncEnabled,
  setAutoSyncEnabled,
};
