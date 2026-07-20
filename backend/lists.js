const {
  getSafeUserById,
  getAnimeById,
  getMangaById,
  getUserAnimeEntry,
  getUserAnimeList,
  addUserAnimeEntry,
  updateUserAnimeEntry,
  removeUserAnimeEntry,
  clearUserAnimeList,
  getUserMangaEntry,
  getUserMangaList,
  addUserMangaEntry,
  updateUserMangaEntry,
  removeUserMangaEntry,
  clearUserMangaList,
  saveManga,
  saveAnimeSummary,
  updateAnimeAdultFlag,
  getAniListAccountByUserId,
  getMalAccountByUserId,
  getAnimeExternalIdByAnimeId,
  enqueueSyncJob,
  getSyncQueueJob,
  deleteSyncQueueJobByEntry,
} = require('./db');
const { mapAnimeForDb } = require('./animeMapper');
const anilist = require('./anilist');
const {
  buildAniListPayload,
  buildAniListDeletePayload,
  buildAniListMangaPayload,
  buildAniListMangaDeletePayload,
  buildMalPayload,
  buildMalDeletePayload,
  buildMalMangaPayload,
  buildMalMangaDeletePayload,
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

async function getMyAnimeList(currentSession) {
  const auth = requireAuthenticatedUser(currentSession);
  if (!auth.ok) {
    return { ok: false, message: auth.message, entries: [] };
  }

  let storedEntries = getUserAnimeList(auth.user.id);
  const missingAdultFlags = storedEntries
    .filter((entry) => entry.is_adult === null || entry.is_adult === undefined)
    .map((entry) => entry.anime_id);

  if (missingAdultFlags.length) {
    try {
      const flags = await anilist.getAnimeAdultFlags(missingAdultFlags);
      for (const media of flags) {
        if (typeof media.isAdult === 'boolean') {
          updateAnimeAdultFlag(media.id, media.isAdult);
        }
      }
      storedEntries = getUserAnimeList(auth.user.id);
    } catch (error) {
      console.warn('Failed to refresh adult-content flags for My List:', error);
    }
  }

  const entries = storedEntries.map((entry) => ({
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

function getMyMangaList(currentSession) {
  const auth = requireAuthenticatedUser(currentSession);
  if (!auth.ok) {
    return { ok: false, message: auth.message, entries: [] };
  }

  return { ok: true, entries: getUserMangaList(auth.user.id) };
}

function getMyMangaEntry(currentSession, mangaId) {
  const auth = requireAuthenticatedUser(currentSession);
  if (!auth.ok) {
    return { ok: false, message: auth.message, entry: null };
  }

  const numericMangaId = Number(mangaId);
  if (!Number.isInteger(numericMangaId) || numericMangaId <= 0) {
    return { ok: false, message: 'Invalid manga id.', entry: null };
  }

  return {
    ok: true,
    entry: getUserMangaEntry(auth.user.id, numericMangaId) || null,
  };
}

function saveMyMangaEntry(currentSession, mangaId, payload = {}, options = {}) {
  const auth = requireAuthenticatedUser(currentSession);
  if (!auth.ok) return { ok: false, message: auth.message };

  const numericMangaId = Number(mangaId);
  if (!Number.isInteger(numericMangaId) || numericMangaId <= 0) {
    return { ok: false, message: 'Invalid manga id.' };
  }

  if (!getMangaById(numericMangaId)) {
    return { ok: false, message: 'Manga is not cached yet. Open its details first.' };
  }

  const existingEntry = getUserMangaEntry(auth.user.id, numericMangaId);
  const status = sanitizeStatus(payload.status);
  const entry = {
    userId: auth.user.id,
    mangaId: numericMangaId,
    status,
    isFavorite: sanitizeFavorite(payload.isFavorite, existingEntry?.is_favorite),
    repeatCount: sanitizeRepeatCount(payload.repeatCount ?? existingEntry?.repeat_count ?? 0),
    isRereading:
      payload.isRereading === undefined
        ? Boolean(existingEntry?.is_rereading)
        : Boolean(payload.isRereading),
    progress: sanitizeProgress(payload.progress),
    volumeProgress: sanitizeProgress(payload.volumeProgress),
    score: sanitizeScore(payload.score),
    notes: sanitizeNotes(payload.notes),
    ...buildDates(status, payload, existingEntry),
    localUpdatedAt: options.localActivityAt ?? null,
  };

  if (existingEntry) updateUserMangaEntry(entry);
  else addUserMangaEntry(entry);

  const savedEntry = getUserMangaEntry(auth.user.id, numericMangaId);
  queueMangaSyncIfNeeded(auth.user.id, existingEntry, savedEntry);

  return {
    ok: true,
    message: existingEntry ? 'Manga list entry updated.' : 'Manga added to your list.',
    entry: savedEntry,
  };
}

function removeMyMangaEntry(currentSession, mangaId) {
  const auth = requireAuthenticatedUser(currentSession);
  if (!auth.ok) return { ok: false, message: auth.message };

  const numericMangaId = Number(mangaId);
  if (!Number.isInteger(numericMangaId) || numericMangaId <= 0) {
    return { ok: false, message: 'Invalid manga id.' };
  }

  const existing = getUserMangaEntry(auth.user.id, numericMangaId);
  if (!existing) return { ok: false, message: 'Manga list entry not found.' };

  queueMangaDeleteSyncIfNeeded(auth.user.id, existing);
  removeUserMangaEntry(auth.user.id, numericMangaId);
  return { ok: true, message: 'Manga removed from your list.' };
}

function saveMyAnimeEntry(currentSession, animeId, payload = {}, options = {}) {
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
      localUpdatedAt: options.localActivityAt ?? null,
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
      localUpdatedAt: options.localActivityAt ?? null,
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

  let queued = false;

  if (getAniListAccountByUserId(userId)) {
    deleteSyncQueueJobByEntry(userId, savedEntry.anime_id, 'delete_anilist_entry');
    enqueueSyncJob({
      userId,
      animeId: savedEntry.anime_id,
      operation: 'upsert_anilist_entry',
      payload: buildAniListPayload(savedEntry),
      changedFields,
    });
    queued = true;
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
    } else {
      enqueueSyncJob({
        userId,
        animeId: savedEntry.anime_id,
        operation: 'upsert_mal_entry',
        payload: buildMalPayload(savedEntry, malMapping.external_id),
        changedFields,
      });
    }
    queued = true;
  }

  if (queued) scheduleAutoSync(userId);
}

function getMangaChangedFields(existingEntry, savedEntry) {
  return [
    ...getChangedFields(existingEntry, savedEntry),
    {
      field: 'volumeProgress',
      from: existingEntry?.volume_progress ?? null,
      to: savedEntry?.volume_progress ?? null,
    },
  ].filter((change) => change.from !== change.to);
}

function queueMangaSyncIfNeeded(userId, existingEntry, savedEntry) {
  if (!savedEntry) return;
  const changedFields = getMangaChangedFields(existingEntry, savedEntry);
  if (!changedFields.length) return;
  let queued = false;

  if (getAniListAccountByUserId(userId)) {
    deleteSyncQueueJobByEntry(
      userId,
      savedEntry.manga_id,
      'delete_anilist_manga_entry',
      'MANGA'
    );
    enqueueSyncJob({
      userId,
      mangaId: savedEntry.manga_id,
      mediaType: 'MANGA',
      operation: 'upsert_anilist_manga_entry',
      payload: buildAniListMangaPayload(savedEntry),
      changedFields,
    });
    queued = true;
  }

  if (getMalAccountByUserId(userId)) {
    deleteSyncQueueJobByEntry(
      userId,
      savedEntry.manga_id,
      'delete_mal_manga_entry',
      'MANGA'
    );
    enqueueSyncJob({
      userId,
      mangaId: savedEntry.manga_id,
      mediaType: 'MANGA',
      operation: 'upsert_mal_manga_entry',
      payload: buildMalMangaPayload(
        savedEntry,
        savedEntry.details?.idMal ?? null
      ),
      changedFields,
    });
    queued = true;
  }

  if (queued) scheduleAutoSync(userId);
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

  let queued = false;

  if (linkedAniListAccount?.access_token) {
    const pendingUpsert = getSyncQueueJob(userId, existingEntry.anime_id, 'upsert_anilist_entry');
    deleteSyncQueueJobByEntry(userId, existingEntry.anime_id, 'upsert_anilist_entry');

    if (!isPendingCreateJob(pendingUpsert)) {
      enqueueSyncJob({
        userId,
        animeId: existingEntry.anime_id,
        operation: 'delete_anilist_entry',
        payload: buildAniListDeletePayload(existingEntry, linkedAniListAccount.anilist_user_id),
        changedFields,
      });
      queued = true;
    }
  }

  if (linkedMalAccount?.access_token) {
    const malMapping = getAnimeExternalIdByAnimeId('mal', existingEntry.anime_id);
    const pendingUpsert = getSyncQueueJob(userId, existingEntry.anime_id, 'upsert_mal_entry');

    deleteSyncQueueJobByEntry(userId, existingEntry.anime_id, 'upsert_mal_entry');

    if (!isPendingCreateJob(pendingUpsert)) {
      enqueueSyncJob({
        userId,
        animeId: existingEntry.anime_id,
        operation: 'delete_mal_entry',
        payload: buildMalDeletePayload(existingEntry, malMapping?.external_id ?? null),
        changedFields,
      });
      queued = true;
    }
  }

  if (queued) scheduleAutoSync(userId);
}

function queueMangaDeleteSyncIfNeeded(userId, existingEntry) {
  if (!existingEntry) return;
  const changedFields = getDeleteChangedFields(existingEntry);
  const linkedAniListAccount = getAniListAccountByUserId(userId);
  const linkedMalAccount = getMalAccountByUserId(userId);
  let queued = false;

  if (linkedAniListAccount?.access_token) {
    const pending = getSyncQueueJob(
      userId,
      existingEntry.manga_id,
      'upsert_anilist_manga_entry',
      'MANGA'
    );
    deleteSyncQueueJobByEntry(
      userId,
      existingEntry.manga_id,
      'upsert_anilist_manga_entry',
      'MANGA'
    );
    if (!isPendingCreateJob(pending)) {
      enqueueSyncJob({
        userId,
        mangaId: existingEntry.manga_id,
        mediaType: 'MANGA',
        operation: 'delete_anilist_manga_entry',
        payload: buildAniListMangaDeletePayload(
          existingEntry,
          linkedAniListAccount.anilist_user_id
        ),
        changedFields,
      });
      queued = true;
    }
  }

  if (linkedMalAccount?.access_token) {
    const pending = getSyncQueueJob(
      userId,
      existingEntry.manga_id,
      'upsert_mal_manga_entry',
      'MANGA'
    );
    deleteSyncQueueJobByEntry(
      userId,
      existingEntry.manga_id,
      'upsert_mal_manga_entry',
      'MANGA'
    );
    if (!isPendingCreateJob(pending)) {
      enqueueSyncJob({
        userId,
        mangaId: existingEntry.manga_id,
        mediaType: 'MANGA',
        operation: 'delete_mal_manga_entry',
        payload: buildMalMangaDeletePayload(existingEntry, existingEntry.details?.idMal ?? null),
        changedFields,
      });
      queued = true;
    }
  }

  if (queued) scheduleAutoSync(userId);
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
        ? `Cleared ${removedCount} Anime entr${removedCount === 1 ? 'y' : 'ies'} from your list.`
        : 'Your Anime list was already empty.',
    removedCount,
    animeRemovedCount: removedCount,
    mangaRemovedCount: 0,
  };
}

function clearMyMangaList(currentSession) {
  const auth = requireAuthenticatedUser(currentSession);
  if (!auth.ok) return { ok: false, message: auth.message };

  const existingEntries = getUserMangaList(auth.user.id);
  for (const entry of existingEntries) queueMangaDeleteSyncIfNeeded(auth.user.id, entry);

  const removedCount = clearUserMangaList(auth.user.id);
  return {
    ok: true,
    message:
      removedCount > 0
        ? `Cleared ${removedCount} Manga entr${removedCount === 1 ? 'y' : 'ies'} from your list.`
        : 'Your Manga list was already empty.',
    removedCount,
    animeRemovedCount: 0,
    mangaRemovedCount: removedCount,
  };
}

function clearAllMediaLists(currentSession) {
  const animeResult = clearMyAnimeList(currentSession);
  if (!animeResult.ok) return animeResult;
  const mangaResult = clearMyMangaList(currentSession);
  if (!mangaResult.ok) return mangaResult;

  const animeRemovedCount = Number(animeResult.removedCount ?? 0);
  const mangaRemovedCount = Number(mangaResult.removedCount ?? 0);
  const removedCount = animeRemovedCount + mangaRemovedCount;
  return {
    ok: true,
    message:
      removedCount > 0
        ? `Cleared ${animeRemovedCount} Anime and ${mangaRemovedCount} Manga entries.`
        : 'Both of your media lists were already empty.',
    removedCount,
    animeRemovedCount,
    mangaRemovedCount,
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

function clearPulledAnimeSyncJobs(userId, animeId, sourceProvider) {
  if (sourceProvider === 'mal') {
    deleteSyncQueueJobByEntry(userId, animeId, 'upsert_mal_entry', 'ANIME');
    deleteSyncQueueJobByEntry(userId, animeId, 'delete_mal_entry', 'ANIME');
    return;
  }
  if (sourceProvider === 'anilist') {
    deleteSyncQueueJobByEntry(userId, animeId, 'upsert_anilist_entry', 'ANIME');
    deleteSyncQueueJobByEntry(userId, animeId, 'delete_anilist_entry', 'ANIME');
  }
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
  const hasAnimeFilter = Boolean(options.selectionProvided) || selectedAnimeIds.length > 0;
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

    clearPulledAnimeSyncJobs(auth.user.id, animeId, options.sourceProvider);

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

function entryDiffersFromManga(existingEntry, nextEntry) {
  if (!existingEntry) return true;
  return (
    valuesDiffer(existingEntry.status, nextEntry.status) ||
    valuesDiffer(existingEntry.progress, nextEntry.progress) ||
    valuesDiffer(existingEntry.volume_progress, nextEntry.volumeProgress) ||
    valuesDiffer(existingEntry.score, nextEntry.score) ||
    valuesDiffer(existingEntry.notes, nextEntry.notes) ||
    valuesDiffer(existingEntry.started_at, nextEntry.startedAt) ||
    valuesDiffer(existingEntry.completed_at, nextEntry.completedAt) ||
    valuesDiffer(existingEntry.repeat_count, nextEntry.repeatCount) ||
    Boolean(existingEntry.is_rereading) !== Boolean(nextEntry.isRereading)
  );
}

function clearPulledMangaSyncJobs(userId, mangaId, sourceProvider) {
  if (sourceProvider === 'mal') {
    deleteSyncQueueJobByEntry(userId, mangaId, 'upsert_mal_manga_entry', 'MANGA');
    deleteSyncQueueJobByEntry(userId, mangaId, 'delete_mal_manga_entry', 'MANGA');
    return;
  }
  if (sourceProvider === 'anilist') {
    deleteSyncQueueJobByEntry(userId, mangaId, 'upsert_anilist_manga_entry', 'MANGA');
    deleteSyncQueueJobByEntry(userId, mangaId, 'delete_anilist_manga_entry', 'MANGA');
  }
}

function importAniListMangaEntries(currentSession, collection, sourceUsername, options = {}) {
  const auth = requireAuthenticatedUser(currentSession);
  if (!auth.ok) return { ok: false, message: auth.message };

  const allEntries = (Array.isArray(collection?.lists) ? collection.lists : []).flatMap(
    (list) => list?.entries || []
  );
  const selectedStatuses = Array.isArray(options.selectedStatuses)
    ? options.selectedStatuses.map((status) => sanitizeStatus(status))
    : [];
  const selectedMangaIds = Array.isArray(options.selectedMangaIds)
    ? options.selectedMangaIds
        .map((mangaId) => Number(mangaId))
        .filter((mangaId) => Number.isInteger(mangaId) && mangaId > 0)
    : [];
  const hasStatusFilter = selectedStatuses.length > 0;
  const allowedStatuses = new Set(selectedStatuses);
  const hasMangaFilter = Boolean(options.selectionProvided) || selectedMangaIds.length > 0;
  const allowedMangaIds = new Set(selectedMangaIds);
  let imported = 0;
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const changes = [];
  const emitProgress =
    typeof options.onProgress === 'function' ? options.onProgress : () => {};

  for (const [index, entry] of allEntries.entries()) {
    const media = entry?.media;
    const mangaId = Number(media?.id);
    const status = sanitizeImportStatus(entry?.status);
    const entryTitle =
      media?.title?.userPreferred ||
      media?.title?.english ||
      media?.title?.romaji ||
      `Manga #${mangaId || index + 1}`;

    if (!Number.isInteger(mangaId) || mangaId <= 0 || !status || !media) {
      skipped += 1;
      emitProgress({ current: index + 1, total: allEntries.length, entryTitle });
      continue;
    }

    if (
      (hasStatusFilter && !allowedStatuses.has(status)) ||
      (hasMangaFilter && !allowedMangaIds.has(mangaId))
    ) {
      skipped += 1;
      emitProgress({ current: index + 1, total: allEntries.length, entryTitle });
      continue;
    }

    saveManga(media);
    const existingEntry = getUserMangaEntry(auth.user.id, mangaId);
    const nextEntry = {
      status,
      progress: sanitizeProgress(entry.progress),
      volumeProgress: sanitizeProgress(entry.progressVolumes),
      score: sanitizeScore(entry.score),
      notes: sanitizeNotes(entry.notes),
      repeatCount: sanitizeRepeatCount(entry.repeat),
      isRereading: String(entry.status || '').toUpperCase() === 'REPEATING',
      startedAt: mapAniListDate(entry.startedAt),
      completedAt: mapAniListDate(entry.completedAt),
    };

    clearPulledMangaSyncJobs(auth.user.id, mangaId, options.sourceProvider);

    if (!entryDiffersFromManga(existingEntry, nextEntry)) {
      skipped += 1;
      emitProgress({ current: index + 1, total: allEntries.length, entryTitle });
      continue;
    }

    const changedFields = [
      { field: 'status', from: existingEntry?.status ?? null, to: nextEntry.status },
      { field: 'progress', from: existingEntry?.progress ?? null, to: nextEntry.progress },
      {
        field: 'volumeProgress',
        from: existingEntry?.volume_progress ?? null,
        to: nextEntry.volumeProgress,
      },
      { field: 'score', from: existingEntry?.score ?? null, to: nextEntry.score },
      { field: 'notes', from: existingEntry?.notes ?? null, to: nextEntry.notes },
      { field: 'startedAt', from: existingEntry?.started_at ?? null, to: nextEntry.startedAt },
      {
        field: 'completedAt',
        from: existingEntry?.completed_at ?? null,
        to: nextEntry.completedAt,
      },
      {
        field: 'repeatCount',
        from: existingEntry?.repeat_count ?? null,
        to: nextEntry.repeatCount,
      },
    ].filter((change) => valuesDiffer(change.from, change.to));

    const payload = {
      userId: auth.user.id,
      mangaId,
      status: nextEntry.status,
      isFavorite: Boolean(existingEntry?.is_favorite),
      repeatCount: nextEntry.repeatCount,
      isRereading: nextEntry.isRereading,
      progress: nextEntry.progress,
      volumeProgress: nextEntry.volumeProgress,
      score: nextEntry.score,
      notes: nextEntry.notes,
      startedAt: nextEntry.startedAt,
      completedAt: nextEntry.completedAt,
    };
    if (existingEntry) {
      updateUserMangaEntry(payload);
      updated += 1;
    } else {
      addUserMangaEntry(payload);
      created += 1;
    }

    imported += 1;
    changes.push({ mangaId, animeTitle: entryTitle, changedFields });
    emitProgress({ current: index + 1, total: allEntries.length, entryTitle });
  }

  return {
    ok: true,
    message: `Imported ${imported} Manga entr${imported === 1 ? 'y' : 'ies'}.`,
    summary: {
      sourceUsername,
      totalFound: allEntries.length,
      selectedStatuses,
      selectedMangaIds,
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
  getMyMangaList,
  getMyMangaEntry,
  saveMyMangaEntry,
  removeMyMangaEntry,
  clearMyAnimeList,
  clearMyMangaList,
  clearAllMediaLists,
  importAniListEntries,
  importAniListMangaEntries,
};
