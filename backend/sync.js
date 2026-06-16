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
  upsertAnimeExternalId,
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
const statelessRunningUsers = new Set();

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

function getEntryTitle(entry) {
  return (
    entry?.title_preferred ||
    entry?.title_english ||
    entry?.title_romaji ||
    entry?.title_native ||
    `Anime #${entry?.anime_id}`
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

  for (const title of getLocalEntryTitles(entry)) {
    const candidates = await mal.searchAnime(title, { accessToken, limit: 10 });

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

  if (!best || best.score < 85) {
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
              malAnimeId = await resolveMalAnimeIdForAnime(job.anime_id, account.access_token, {
                submittedByUserId: userId,
              });
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
              malAnimeId = await resolveMalAnimeIdForAnime(job.anime_id, account.access_token, {
                submittedByUserId: userId,
              });
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

function getStatelessSyncStatus(userId, localPendingCount = 0, autoSyncEnabled = true) {
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
  const linkedAniListAccount = getAniListAccountByUserId(userId);
  const linkedMalAccount = await getFreshMalAccountByUserId(userId);
  const activity = [];

  if (!linkedAniListAccount?.access_token && !linkedMalAccount?.access_token) {
    return {
      ok: false,
      message: 'Link an AniList or MyAnimeList account before syncing.',
      synced: 0,
      failed: 0,
      pending: entries.length + deletedEntries.length,
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
    } else if (linkedMalAccount?.access_token) {
      for (const entry of entries) {
        try {
          const malAnimeId = await withFreshMalAccount(userId, async (account) => {
            return await resolveMalAnimeIdForLocalEntry(
              {
                ...entry,
                submitted_by_user_id: userId,
              },
              account.access_token
            );
          });

          if (!malAnimeId) {
            throw new Error('No MyAnimeList ID mapping exists for this anime.');
          }

          await withFreshMalAccount(userId, async (account) => {
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
      }

      for (const entry of deletedEntries) {
        try {
          const malAnimeId = entry?.external_ids?.mal || getAnimeExternalIdByAnimeId('mal', entry.anime_id)?.external_id;

          if (!malAnimeId) {
            throw new Error('No MyAnimeList ID mapping exists for this anime.');
          }

          await withFreshMalAccount(userId, async (account) => {
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
      }
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
  buildMalPayload,
  buildMalDeletePayload,
  scheduleAutoSync,
  runSyncForUser,
  getSyncStatus,
  getSyncActivity,
  getAutoSyncEnabled,
  setAutoSyncEnabled,
  getStatelessSyncStatus,
  runStatelessSyncForUser,
};
