const {
  getSafeUserById,
  getAnimeById,
  getUserAnimeEntry,
  getUserAnimeList,
  addUserAnimeEntry,
  updateUserAnimeEntry,
  removeUserAnimeEntry,
  clearUserAnimeList,
  saveAnimeSummary,
  getAniListAccountByUserId,
  getMalAccountByUserId,
  getAnimeExternalIdByAnimeId,
  enqueueSyncJob,
  getSyncQueueJob,
  deleteSyncQueueJobByEntry,
} = require('./db');
const { mapAnimeForDb } = require('./animeMapper');
const {
  buildAniListPayload,
  buildAniListDeletePayload,
  buildMalPayload,
  buildMalDeletePayload,
  scheduleAutoSync,
} = require('./sync');

const ALLOWED_STATUSES = ['planned', 'watching', 'completed', 'paused', 'dropped'];

function sanitizeStatus(status) {
  const value = String(status || '')
    .trim()
    .toLowerCase();
  return ALLOWED_STATUSES.includes(value) ? value : 'planned';
}

function sanitizeProgress(progress) {
  const value = Number(progress);

  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.floor(value);
}

function sanitizeRepeatCount(repeatCount) {
  const value = Number(repeatCount);

  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.floor(value);
}

function sanitizeScore(score) {
  if (score === null || score === undefined || score === '') {
    return null;
  }

  const value = Number(score);

  if (!Number.isFinite(value)) {
    return null;
  }

  return value;
}

function sanitizeNotes(notes) {
  const value = String(notes || '').trim();
  return value.length ? value : null;
}

function sanitizeFavorite(isFavorite, fallback = false) {
  if (isFavorite === undefined) {
    return Boolean(fallback);
  }

  return Boolean(isFavorite);
}

function sanitizeDate(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const text = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function buildDates(status, payload, existingEntry) {
  const today = getTodayDate();
  const hasExplicitCompletedAt = payload.completedAt !== undefined;

  let startedAt =
    payload.startedAt !== undefined
      ? sanitizeDate(payload.startedAt)
      : existingEntry?.started_at || null;
  let completedAt =
    payload.completedAt !== undefined
      ? sanitizeDate(payload.completedAt)
      : existingEntry?.completed_at || null;

  if (status === 'watching' && !startedAt) {
    startedAt = today;
  }

  if (status === 'completed') {
    if (!startedAt) {
      startedAt = today;
    }
    if (!completedAt) {
      completedAt = today;
    }
  }

  if (!['completed', 'dropped'].includes(status) && !hasExplicitCompletedAt) {
    completedAt = null;
  }

  return { startedAt, completedAt };
}

function requireAuthenticatedUser(currentSession) {
  if (!currentSession?.authenticated || !currentSession.user?.id) {
    return { ok: false, message: 'You must be logged in.', user: null };
  }

  const user = getSafeUserById(currentSession.user.id);

  if (!user) {
    return { ok: false, message: 'User not found.', user: null };
  }

  return { ok: true, user };
}

function getMyAnimeList(currentSession) {
  const auth = requireAuthenticatedUser(currentSession);
  if (!auth.ok) {
    return { ok: false, message: auth.message, entries: [] };
  }

  const entries = getUserAnimeList(auth.user.id).map((entry) => ({
    ...entry,
    genres: parseJsonArray(entry.genres),
    recommendations: parseJsonArray(entry.recommendations),
  }));
  return { ok: true, entries };
}

function getMyAnimeEntry(currentSession, animeId) {
  const auth = requireAuthenticatedUser(currentSession);
  if (!auth.ok) {
    return { ok: false, message: auth.message, entry: null };
  }

  const numericAnimeId = Number(animeId);
  if (!Number.isInteger(numericAnimeId) || numericAnimeId <= 0) {
    return { ok: false, message: 'Invalid anime id.', entry: null };
  }

  const entry = getUserAnimeEntry(auth.user.id, numericAnimeId);
  return { ok: true, entry: entry || null };
}

function saveMyAnimeEntry(currentSession, animeId, payload = {}) {
  const auth = requireAuthenticatedUser(currentSession);
  if (!auth.ok) {
    return { ok: false, message: auth.message };
  }

  const numericAnimeId = Number(animeId);
  if (!Number.isInteger(numericAnimeId) || numericAnimeId <= 0) {
    return { ok: false, message: 'Invalid anime id.' };
  }

  const anime = getAnimeById(numericAnimeId);
  if (!anime) {
    return { ok: false, message: 'Anime is not cached yet. Open its details first.' };
  }

  const existingEntry = getUserAnimeEntry(auth.user.id, numericAnimeId);

  const status = sanitizeStatus(payload.status);
  const isFavorite = sanitizeFavorite(payload.isFavorite, existingEntry?.is_favorite);
  const progress = sanitizeProgress(payload.progress);
  const score = sanitizeScore(payload.score);
  const notes = sanitizeNotes(payload.notes);
  const repeatCount = sanitizeRepeatCount(
    payload.repeatCount ?? existingEntry?.repeat_count ?? 0
  );
  const isRewatching =
    payload.isRewatching === undefined
      ? Boolean(existingEntry?.is_rewatching)
      : Boolean(payload.isRewatching);
  const { startedAt, completedAt } = buildDates(status, payload, existingEntry);

  let savedEntry;

  if (!existingEntry) {
    addUserAnimeEntry({
      userId: auth.user.id,
      animeId: numericAnimeId,
      status,
      isFavorite,
      repeatCount,
      isRewatching,
      progress,
      score,
      notes,
      startedAt,
      completedAt,
    });
  } else {
    updateUserAnimeEntry({
      userId: auth.user.id,
      animeId: numericAnimeId,
      status,
      isFavorite,
      repeatCount,
      isRewatching,
      progress,
      score,
      notes,
      startedAt,
      completedAt,
    });
  }

  savedEntry = getUserAnimeEntry(auth.user.id, numericAnimeId);

  queueSyncIfNeeded(auth.user.id, existingEntry, savedEntry);

  return {
    ok: true,
    message: existingEntry ? 'List entry updated.' : 'Anime added to your list.',
    entry: savedEntry,
  };
}

function getChangedFields(existingEntry, savedEntry) {
  const fields = [
    ['status', 'status'],
    ['progress', 'progress'],
    ['score', 'score'],
    ['notes', 'notes'],
    ['started_at', 'startedAt'],
    ['completed_at', 'completedAt'],
    ['repeat_count', 'repeatCount'],
  ];

  return fields
    .map(([dbField, label]) => ({
      field: label,
      from: existingEntry ? existingEntry[dbField] ?? null : null,
      to: savedEntry[dbField] ?? null,
    }))
    .filter((change) => change.from !== change.to);
}

function queueSyncIfNeeded(userId, existingEntry, savedEntry) {
  if (!savedEntry) {
    return;
  }

  const changedFields = getChangedFields(existingEntry, savedEntry);

  if (!changedFields.length) {
    return;
  }

  if (getAniListAccountByUserId(userId)) {
    deleteSyncQueueJobByEntry(userId, savedEntry.anime_id, 'delete_anilist_entry');
    enqueueSyncJob({
      userId,
      animeId: savedEntry.anime_id,
      operation: 'upsert_anilist_entry',
      payload: buildAniListPayload(savedEntry),
      changedFields,
    });
    scheduleAutoSync(userId);
    return;
  }

  if (getMalAccountByUserId(userId)) {
    deleteSyncQueueJobByEntry(userId, savedEntry.anime_id, 'delete_mal_entry');
    const malMapping = getAnimeExternalIdByAnimeId('mal', savedEntry.anime_id);

    if (!malMapping?.external_id) {
      enqueueSyncJob({
        userId,
        animeId: savedEntry.anime_id,
        operation: 'upsert_mal_entry',
        payload: buildMalPayload(savedEntry, null),
        changedFields,
      });
      scheduleAutoSync(userId);
      return;
    }

    enqueueSyncJob({
      userId,
      animeId: savedEntry.anime_id,
      operation: 'upsert_mal_entry',
      payload: buildMalPayload(savedEntry, malMapping.external_id),
      changedFields,
    });
    scheduleAutoSync(userId);
  }
}

function getDeleteChangedFields(existingEntry) {
  return [
    { field: 'entry', from: 'present', to: null },
    { field: 'status', from: existingEntry?.status ?? null, to: null },
    { field: 'progress', from: existingEntry?.progress ?? null, to: null },
    { field: 'score', from: existingEntry?.score ?? null, to: null },
  ];
}

function isPendingCreateJob(job) {
  return Boolean(
    job?.changedFields?.some((change) => change?.field === 'status' && change.from === null)
  );
}

function queueDeleteSyncIfNeeded(userId, existingEntry) {
  if (!existingEntry) {
    return;
  }

  const linkedAniListAccount = getAniListAccountByUserId(userId);
  const linkedMalAccount = getMalAccountByUserId(userId);
  const changedFields = getDeleteChangedFields(existingEntry);

  if (linkedAniListAccount?.access_token) {
    const pendingUpsert = getSyncQueueJob(userId, existingEntry.anime_id, 'upsert_anilist_entry');
    deleteSyncQueueJobByEntry(userId, existingEntry.anime_id, 'upsert_anilist_entry');

    if (isPendingCreateJob(pendingUpsert)) {
      return;
    }

    enqueueSyncJob({
      userId,
      animeId: existingEntry.anime_id,
      operation: 'delete_anilist_entry',
      payload: buildAniListDeletePayload(existingEntry, linkedAniListAccount.anilist_user_id),
      changedFields,
    });
    scheduleAutoSync(userId);
    return;
  }

  if (linkedMalAccount?.access_token) {
    const malMapping = getAnimeExternalIdByAnimeId('mal', existingEntry.anime_id);
    const pendingUpsert = getSyncQueueJob(userId, existingEntry.anime_id, 'upsert_mal_entry');

    deleteSyncQueueJobByEntry(userId, existingEntry.anime_id, 'upsert_mal_entry');

    if (isPendingCreateJob(pendingUpsert)) {
      return;
    }

    enqueueSyncJob({
      userId,
      animeId: existingEntry.anime_id,
      operation: 'delete_mal_entry',
      payload: buildMalDeletePayload(existingEntry, malMapping?.external_id ?? null),
      changedFields,
    });
    scheduleAutoSync(userId);
  }
}

function removeMyAnimeEntry(currentSession, animeId) {
  const auth = requireAuthenticatedUser(currentSession);
  if (!auth.ok) {
    return { ok: false, message: auth.message };
  }

  const numericAnimeId = Number(animeId);
  if (!Number.isInteger(numericAnimeId) || numericAnimeId <= 0) {
    return { ok: false, message: 'Invalid anime id.' };
  }

  const existingEntry = getUserAnimeEntry(auth.user.id, numericAnimeId);
  if (!existingEntry) {
    return { ok: false, message: 'Entry not found.' };
  }

  queueDeleteSyncIfNeeded(auth.user.id, existingEntry);
  removeUserAnimeEntry(auth.user.id, numericAnimeId);

  return { ok: true, message: 'Anime removed from your list.' };
}

function clearMyAnimeList(currentSession) {
  const auth = requireAuthenticatedUser(currentSession);
  if (!auth.ok) {
    return { ok: false, message: auth.message };
  }

  const existingEntries = getUserAnimeList(auth.user.id);

  for (const entry of existingEntries) {
    queueDeleteSyncIfNeeded(auth.user.id, entry);
  }

  const removedCount = clearUserAnimeList(auth.user.id);

  return {
    ok: true,
    message:
      removedCount > 0
        ? `Cleared ${removedCount} entr${removedCount === 1 ? 'y' : 'ies'} from your list.`
        : 'Your list was already empty.',
    removedCount,
  };
}

function sanitizeImportStatus(status) {
  const value = String(status || '')
    .trim()
    .toUpperCase();

  switch (value) {
    case 'CURRENT':
    case 'REPEATING':
      return 'watching';
    case 'PLANNING':
      return 'planned';
    case 'COMPLETED':
      return 'completed';
    case 'PAUSED':
      return 'paused';
    case 'DROPPED':
      return 'dropped';
    default:
      return null;
  }
}

function mapAniListDate(date) {
  if (!date?.year) {
    return null;
  }

  const month = String(date.month || 1).padStart(2, '0');
  const day = String(date.day || 1).padStart(2, '0');
  return `${date.year}-${month}-${day}`;
}

function parseJsonArray(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function valuesDiffer(left, right) {
  return (left ?? null) !== (right ?? null);
}

function buildStoredImportEntry(existingEntry, nextEntry) {
  return {
    ...nextEntry,
    startedAt: nextEntry.startedAt ?? existingEntry?.started_at ?? null,
    completedAt: ['completed', 'dropped'].includes(nextEntry.status)
      ? nextEntry.completedAt ?? existingEntry?.completed_at ?? null
      : null,
  };
}

function entryDiffersFromAniList(existingEntry, nextEntry) {
  if (!existingEntry) {
    return true;
  }

  const storedEntry = buildStoredImportEntry(existingEntry, nextEntry);

  return (
    valuesDiffer(existingEntry.status, storedEntry.status) ||
    valuesDiffer(existingEntry.progress, storedEntry.progress) ||
    valuesDiffer(existingEntry.score, storedEntry.score) ||
    valuesDiffer(existingEntry.notes, storedEntry.notes) ||
    valuesDiffer(existingEntry.started_at, storedEntry.startedAt) ||
    valuesDiffer(existingEntry.completed_at, storedEntry.completedAt) ||
    valuesDiffer(existingEntry.repeat_count, storedEntry.repeatCount) ||
    Boolean(existingEntry.is_rewatching)
  );
}

function importAniListEntries(currentSession, collection, sourceUsername, options = {}) {
  const auth = requireAuthenticatedUser(currentSession);
  if (!auth.ok) {
    return { ok: false, message: auth.message };
  }

  const lists = Array.isArray(collection?.lists) ? collection.lists : [];
  const allEntries = lists.flatMap((list) => list?.entries || []);
  const selectedStatuses = Array.isArray(options.selectedStatuses)
    ? options.selectedStatuses.map((status) => sanitizeStatus(status))
    : [];
  const selectedAnimeIds = Array.isArray(options.selectedAnimeIds)
    ? options.selectedAnimeIds
        .map((animeId) => Number(animeId))
        .filter((animeId) => Number.isInteger(animeId) && animeId > 0)
    : [];
  const hasStatusFilter = selectedStatuses.length > 0;
  const allowedStatuses = new Set(selectedStatuses);
  const hasAnimeFilter = selectedAnimeIds.length > 0;
  const allowedAnimeIds = new Set(selectedAnimeIds);

  if (!allEntries.length) {
    return {
      ok: false,
      message: `No anime list entries were found for ${sourceUsername}.`,
    };
  }

  let imported = 0;
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const changes = [];
  const emitProgress =
    typeof options.onProgress === 'function' ? options.onProgress : () => {};
  let processed = 0;

  function reportImportProgress(media, fallbackAnimeId) {
    emitProgress({
      current: processed,
      total: allEntries.length,
      entryTitle:
        media?.title?.userPreferred ||
        media?.title?.english ||
        media?.title?.romaji ||
        `Anime #${fallbackAnimeId || processed}`,
    });
  }

  for (const entry of allEntries) {
    processed += 1;
    const media = entry?.media;
    const animeId = Number(media?.id);
    const status = sanitizeImportStatus(entry?.status);

    if (!Number.isInteger(animeId) || animeId <= 0 || !status || !media) {
      skipped += 1;
      reportImportProgress(media, animeId);
      continue;
    }

    if (hasStatusFilter && !allowedStatuses.has(status)) {
      skipped += 1;
      reportImportProgress(media, animeId);
      continue;
    }

    if (hasAnimeFilter && !allowedAnimeIds.has(animeId)) {
      skipped += 1;
      reportImportProgress(media, animeId);
      continue;
    }

    saveAnimeSummary(mapAnimeForDb(media));

    const progress = sanitizeProgress(entry.progress);
    const score = sanitizeScore(entry.score);
    const notes = sanitizeNotes(entry.notes);
    const repeatCount = sanitizeRepeatCount(entry.repeat);
    const startedAt = mapAniListDate(entry.startedAt);
    const completedAt = mapAniListDate(entry.completedAt);
    const existingEntry = getUserAnimeEntry(auth.user.id, animeId);
    const nextEntry = {
      status,
      progress,
      score,
      notes,
      repeatCount,
      startedAt,
      completedAt,
    };

    if (!existingEntry) {
      addUserAnimeEntry({
        userId: auth.user.id,
        animeId,
        status,
        isFavorite: false,
        repeatCount,
        isRewatching: false,
        progress,
        score,
        notes,
        startedAt,
        completedAt,
      });
      created += 1;
      changes.push({
        animeId,
        animeTitle:
          media.title?.userPreferred || media.title?.english || media.title?.romaji || `Anime #${animeId}`,
        changedFields: [
          { field: 'status', from: null, to: status },
          { field: 'progress', from: null, to: progress },
          { field: 'score', from: null, to: score },
          { field: 'notes', from: null, to: notes },
          { field: 'startedAt', from: null, to: startedAt },
          { field: 'completedAt', from: null, to: completedAt },
          { field: 'repeatCount', from: null, to: repeatCount },
        ].filter((change) => change.to !== null && change.to !== undefined),
      });
    } else {
      const storedEntry = buildStoredImportEntry(existingEntry, nextEntry);

      if (!entryDiffersFromAniList(existingEntry, nextEntry)) {
        skipped += 1;
        reportImportProgress(media, animeId);
        continue;
      }

      const changedFields = [
        { field: 'status', from: existingEntry.status ?? null, to: storedEntry.status },
        { field: 'progress', from: existingEntry.progress ?? null, to: storedEntry.progress },
        { field: 'score', from: existingEntry.score ?? null, to: storedEntry.score },
        { field: 'notes', from: existingEntry.notes ?? null, to: storedEntry.notes },
        { field: 'startedAt', from: existingEntry.started_at ?? null, to: storedEntry.startedAt },
        { field: 'completedAt', from: existingEntry.completed_at ?? null, to: storedEntry.completedAt },
        { field: 'repeatCount', from: existingEntry.repeat_count ?? null, to: storedEntry.repeatCount },
      ].filter((change) => valuesDiffer(change.from, change.to));

      updateUserAnimeEntry({
        userId: auth.user.id,
        animeId,
        status: storedEntry.status,
        isFavorite: Boolean(existingEntry.is_favorite),
        repeatCount: storedEntry.repeatCount,
        isRewatching: false,
        progress: storedEntry.progress,
        score: storedEntry.score,
        notes: storedEntry.notes,
        startedAt: storedEntry.startedAt,
        completedAt: storedEntry.completedAt,
      });
      updated += 1;
      changes.push({
        animeId,
        animeTitle:
          media.title?.userPreferred || media.title?.english || media.title?.romaji || `Anime #${animeId}`,
        changedFields,
      });
    }

    imported += 1;
    reportImportProgress(media, animeId);
  }

  return {
    ok: true,
    message: `Imported ${imported} AniList entr${imported === 1 ? 'y' : 'ies'}.`,
    summary: {
      sourceUsername,
      totalFound: allEntries.length,
      selectedStatuses,
      selectedAnimeIds,
      imported,
      created,
      updated,
      skipped,
      changes,
    },
  };
}

module.exports = {
  getMyAnimeList,
  getMyAnimeEntry,
  saveMyAnimeEntry,
  removeMyAnimeEntry,
  clearMyAnimeList,
  importAniListEntries,
};
