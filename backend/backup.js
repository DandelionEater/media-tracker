const {
  db,
  saveAnimeSummary,
  saveManga,
  upsertAnimeExternalId,
  getAnimeExternalIdByAnimeId,
  getUserAnimeList,
  getUserMangaList,
  applySyncQueueFailureState,
  enqueueSyncJob,
  getAniListAccountByUserId,
  getMalAccountByUserId,
} = require('./db');
const { mapAnimeForDb } = require('./animeMapper');
const {
  saveMyAnimeEntry,
  saveMyMangaEntry,
} = require('./lists');
const { getSyncStatus, getSyncActivity, setAutoSyncEnabled } = require('./sync');

const BACKUP_FORMAT = 'seenary.local-backup';
const BACKUP_VERSION = 4;

function isPlainRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getRecord(value) {
  return isPlainRecord(value) ? value : {};
}

function validBackup(value) {
  const version = Number(value?.version ?? 1);
  return (
    isPlainRecord(value) &&
    value.format === BACKUP_FORMAT &&
    Number.isInteger(version) &&
    version >= 1 &&
    version <= BACKUP_VERSION &&
    isPlainRecord(value.data)
  );
}

function pickEntry(row, mediaType) {
  const manga = mediaType === 'MANGA';
  return {
    [manga ? 'manga_id' : 'anime_id']: Number(manga ? row.manga_id : row.anime_id),
    status: row.status,
    is_favorite: row.is_favorite ?? 0,
    repeat_count: row.repeat_count ?? 0,
    ...(manga
      ? { is_rereading: row.is_rereading ?? 0, volume_progress: row.volume_progress ?? 0 }
      : { is_rewatching: row.is_rewatching ?? 0 }),
    progress: row.progress ?? 0,
    score: row.score ?? null,
    notes: row.notes ?? null,
    started_at: row.started_at ?? null,
    completed_at: row.completed_at ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    local_updated_at: row.local_updated_at ?? null,
  };
}

function pickMedia(row, mediaType) {
  const manga = mediaType === 'MANGA';
  const mediaId = Number(manga ? row.manga_id : row.anime_id);
  const media = { ...row };

  delete media.id;
  delete media.user_id;
  delete media.status;
  delete media.is_favorite;
  delete media.repeat_count;
  delete media.is_rewatching;
  delete media.is_rereading;
  delete media.progress;
  delete media.volume_progress;
  delete media.score;
  delete media.notes;
  delete media.started_at;
  delete media.completed_at;
  delete media.created_at;

  media[manga ? 'manga_id' : 'anime_id'] = mediaId;
  if (!manga) {
    const parseArray = (value) => {
      if (Array.isArray(value)) return value;
      try {
        const parsed = JSON.parse(value || '[]');
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    };
    const parseDate = (value) => {
      const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
      return match
        ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
        : null;
    };
    media.genres = parseArray(media.genres);
    media.recommendations = parseArray(media.recommendations);
    media.start_date = parseDate(media.start_date);
    media.end_date = parseDate(media.end_date);
  }
  media.external_ids = {
    anilist: String(mediaId),
    mal: manga
      ? media.details?.idMal ?? null
      : getAnimeExternalIdByAnimeId('mal', mediaId)?.external_id ?? null,
  };
  return media;
}

function parseQueuePayload(item) {
  if (isPlainRecord(item?.payload)) return item.payload;
  try {
    return JSON.parse(item?.payload_json || '{}');
  } catch {
    return {};
  }
}

function collectSyncState(activity) {
  const result = {
    dirtyEntries: {},
    deletedEntries: {},
    dirtyMangaEntries: {},
    deletedMangaEntries: {},
    syncFailures: {},
  };

  for (const item of activity.pending ?? []) {
    const manga = item.media_type === 'MANGA' || Boolean(item.manga_id);
    const mediaId = Number(manga ? item.manga_id ?? item.media_id : item.anime_id ?? item.media_id);
    if (!Number.isInteger(mediaId) || mediaId <= 0) continue;
    const key = String(mediaId);
    const deleting = String(item.operation || '').startsWith('delete_');
    if (!deleting) {
      result[manga ? 'dirtyMangaEntries' : 'dirtyEntries'][key] = true;
      continue;
    }

    const payload = parseQueuePayload(item);
    result[manga ? 'deletedMangaEntries' : 'deletedEntries'][key] = {
      [manga ? 'manga_id' : 'anime_id']: mediaId,
      media_type: manga ? 'MANGA' : 'ANIME',
      external_ids: payload.external_ids ?? { anilist: key, mal: null },
      title: item.animeTitle ?? item.media_title ?? null,
      deleted_at: item.created_at ?? new Date().toISOString(),
    };
  }

  for (const item of [...(activity.pending ?? []), ...(activity.excluded ?? [])]) {
    const manga = item.media_type === 'MANGA' || Boolean(item.manga_id);
    const mediaId = Number(manga ? item.manga_id ?? item.media_id : item.anime_id ?? item.media_id);
    const provider = item.provider === 'mal' || String(item.operation || '').includes('mal')
      ? 'mal'
      : 'anilist';
    if (!Number.isInteger(mediaId) || mediaId <= 0 || Number(item.attempts || 0) < 1) continue;
    const mediaType = manga ? 'MANGA' : 'ANIME';
    result.syncFailures[`${provider}:${mediaType}:${mediaId}`] = {
      provider,
      mediaType,
      mediaId,
      animeTitle: item.animeTitle ?? item.media_title ?? null,
      attempts: Number(item.attempts || 0),
      lastError: item.last_error ?? item.message ?? null,
      operation: item.operation,
      updatedAt: item.updated_at ?? item.created_at ?? new Date().toISOString(),
      excludedAt:
        item.status === 'blocked' || item.status === 'excluded'
          ? item.updated_at ?? item.created_at ?? new Date().toISOString()
          : null,
      excludedBy:
        item.status === 'blocked' || item.status === 'excluded'
          ? item.excluded_by === 'system' ? 'system' : 'user'
          : null,
    };
  }

  return result;
}

async function exportBackup(currentSession, settings, preferenceBundle = {}) {
  if (!currentSession?.authenticated || !currentSession.user?.id) {
    throw new Error('You must be logged in.');
  }

  const animeRows = getUserAnimeList(currentSession.user.id);
  const mangaRows = getUserMangaList(currentSession.user.id);

  const anime = {};
  const entries = {};
  const manga = {};
  const mangaEntries = {};
  for (const row of animeRows) {
    const key = String(row.anime_id);
    anime[key] = pickMedia(row, 'ANIME');
    entries[key] = pickEntry(row, 'ANIME');
  }
  for (const row of mangaRows) {
    const key = String(row.manga_id);
    manga[key] = pickMedia(row, 'MANGA');
    mangaEntries[key] = pickEntry(row, 'MANGA');
  }

  const syncStatus = getSyncStatus(currentSession.user.id);
  const activity = getSyncActivity(currentSession.user.id);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    username: currentSession.user.username,
    data: {
      settings,
      anime,
      entries,
      manga,
      mangaEntries,
      ...collectSyncState(activity),
      syncHistory: [...(activity.pulled ?? []), ...(activity.completed ?? []), ...(activity.failed ?? [])],
      autoSyncEnabled: Boolean(syncStatus.autoSyncEnabled),
      portablePreferences: preferenceBundle.portablePreferences,
      desktopPreferences: preferenceBundle.desktopPreferences,
    },
  };
}

function toAnimeMedia(mediaId, stored) {
  const normalizeDate = (value) => {
    if (isPlainRecord(value)) return value;
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match
      ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
      : null;
  };
  return {
    id: mediaId,
    isAdult: stored.is_adult == null ? null : Boolean(stored.is_adult),
    title: {
      romaji: stored.title_romaji ?? null,
      english: stored.title_english ?? null,
      native: stored.title_native ?? null,
      userPreferred: stored.title_preferred ?? stored.title_english ?? stored.title_romaji ?? null,
    },
    coverImage: { extraLarge: stored.cover_image_large ?? null, large: stored.cover_image_large ?? null },
    bannerImage: stored.banner_image ?? null,
    episodes: stored.episodes ?? null,
    format: stored.format ?? null,
    status: stored.anime_status ?? null,
    season: stored.season ?? null,
    seasonYear: stored.season_year ?? null,
    averageScore: stored.average_score ?? null,
    meanScore: stored.mean_score ?? null,
    popularity: stored.popularity ?? null,
    favourites: stored.favourites ?? null,
    duration: stored.duration ?? null,
    source: stored.source ?? null,
    countryOfOrigin: stored.country_of_origin ?? null,
    startDate: normalizeDate(stored.start_date),
    endDate: normalizeDate(stored.end_date),
    genres: Array.isArray(stored.genres) ? stored.genres : [],
    recommendations: { nodes: Array.isArray(stored.recommendations) ? stored.recommendations : [] },
  };
}

function toMangaMedia(mediaId, stored) {
  if (isPlainRecord(stored.details)) return { ...stored.details, id: mediaId };
  return {
    id: mediaId,
    idMal: stored.external_ids?.mal ? Number(stored.external_ids.mal) : null,
    isAdult: stored.is_adult == null ? null : Boolean(stored.is_adult),
    title: {
      romaji: stored.title_romaji ?? null,
      english: stored.title_english ?? null,
      native: stored.title_native ?? null,
      userPreferred: stored.title_preferred ?? stored.title_english ?? stored.title_romaji ?? null,
    },
    coverImage: { extraLarge: stored.cover_image_large ?? null, large: stored.cover_image_large ?? null },
    bannerImage: stored.banner_image ?? null,
    chapters: stored.chapters ?? null,
    volumes: stored.volumes ?? null,
    format: stored.format ?? null,
    status: stored.anime_status ?? null,
    averageScore: stored.average_score ?? null,
    meanScore: stored.mean_score ?? null,
    popularity: stored.popularity ?? null,
    favourites: stored.favourites ?? null,
    source: stored.source ?? null,
    countryOfOrigin: stored.country_of_origin ?? null,
    startDate: stored.start_date ?? null,
    endDate: stored.end_date ?? null,
    genres: Array.isArray(stored.genres) ? stored.genres : [],
    recommendations: { nodes: Array.isArray(stored.recommendations) ? stored.recommendations : [] },
  };
}

function entryPayload(entry, manga) {
  return {
    status: entry.status,
    isFavorite: Boolean(entry.is_favorite),
    repeatCount: entry.repeat_count ?? 0,
    ...(manga
      ? { isRereading: Boolean(entry.is_rereading), volumeProgress: entry.volume_progress ?? 0 }
      : { isRewatching: Boolean(entry.is_rewatching) }),
    progress: entry.progress ?? 0,
    score: entry.score ?? null,
    notes: entry.notes ?? null,
    startedAt: entry.started_at ?? null,
    completedAt: entry.completed_at ?? null,
  };
}

async function importBackup(currentSession, backup, updateSettings) {
  if (!currentSession?.authenticated || !currentSession.user?.id) {
    return { ok: false, message: 'You must be logged in.' };
  }
  if (!validBackup(backup)) {
    return { ok: false, message: 'This does not look like a Seenary backup file.' };
  }

  const data = backup.data;
  const anime = getRecord(data.anime);
  const manga = getRecord(data.manga);
  let animeImported = 0;
  let mangaImported = 0;
  let skipped = 0;
  let restoredSettings = null;
  let syncFailuresRestored = 0;
  let pendingDeletionsRestored = 0;

  const restore = db.transaction(() => {
    if (isPlainRecord(data.settings)) restoredSettings = updateSettings(data.settings);

    for (const [key, entry] of Object.entries(getRecord(data.entries))) {
      const mediaId = Number(entry?.anime_id ?? key);
      const stored = anime[String(mediaId)] ?? anime[key];
      if (
        !Number.isInteger(mediaId) ||
        mediaId <= 0 ||
        !isPlainRecord(entry) ||
        !isPlainRecord(stored)
      ) {
        skipped += 1;
        continue;
      }
      saveAnimeSummary(mapAnimeForDb(toAnimeMedia(mediaId, stored)));
      const malId = stored.external_ids?.mal;
      if (malId) {
        upsertAnimeExternalId({
          provider: 'mal',
          externalId: malId,
          animeId: mediaId,
          submittedByUserId: currentSession.user.id,
        });
      }
      const result = saveMyAnimeEntry(currentSession, mediaId, entryPayload(entry, false), {
        localActivityAt: entry.local_updated_at ?? null,
      });
      if (result.ok) animeImported += 1;
      else skipped += 1;
    }

    for (const [key, entry] of Object.entries(getRecord(data.mangaEntries))) {
      const mediaId = Number(entry?.manga_id ?? key);
      const stored = manga[String(mediaId)] ?? manga[key];
      if (
        !Number.isInteger(mediaId) ||
        mediaId <= 0 ||
        !isPlainRecord(entry) ||
        !isPlainRecord(stored)
      ) {
        skipped += 1;
        continue;
      }
      saveManga(toMangaMedia(mediaId, stored));
      const result = saveMyMangaEntry(currentSession, mediaId, entryPayload(entry, true), {
        localActivityAt: entry.local_updated_at ?? null,
      });
      if (result.ok) mangaImported += 1;
      else skipped += 1;
    }

    const linkedAniList = getAniListAccountByUserId(currentSession.user.id);
    const linkedMal = getMalAccountByUserId(currentSession.user.id);
    const existingAnimeIds = new Set(
      getUserAnimeList(currentSession.user.id).map((entry) => Number(entry.anime_id))
    );
    const existingMangaIds = new Set(
      getUserMangaList(currentSession.user.id).map((entry) => Number(entry.manga_id))
    );
    for (const [collection, mediaType] of [
      [getRecord(data.deletedEntries), 'ANIME'],
      [getRecord(data.deletedMangaEntries), 'MANGA'],
    ]) {
      for (const [key, deletion] of Object.entries(collection)) {
        const mangaDeletion = mediaType === 'MANGA';
        const mediaId = Number(deletion?.[mangaDeletion ? 'manga_id' : 'anime_id'] ?? key);
        if (!Number.isInteger(mediaId) || mediaId <= 0 || !isPlainRecord(deletion)) continue;
        if ((mangaDeletion ? existingMangaIds : existingAnimeIds).has(mediaId)) continue;
        const operation = linkedMal
          ? mangaDeletion ? 'delete_mal_manga_entry' : 'delete_mal_entry'
          : linkedAniList
            ? mangaDeletion ? 'delete_anilist_manga_entry' : 'delete_anilist_entry'
            : null;
        if (!operation) continue;
        const malId = deletion.external_ids?.mal ?? null;
        const job = enqueueSyncJob({
          userId: currentSession.user.id,
          mediaId,
          mediaType,
          operation,
          payload: {
            ...deletion,
            ...(mangaDeletion ? { malMangaId: malId } : { malAnimeId: malId }),
          },
          changedFields: [
            { field: 'entry', from: 'present', to: null },
            { field: 'status', from: deletion.status ?? null, to: null },
          ],
        });
        if (job) pendingDeletionsRestored += 1;
      }
    }

    if (Number(backup.version ?? 1) >= 2 && typeof data.autoSyncEnabled === 'boolean') {
      setAutoSyncEnabled(currentSession.user.id, data.autoSyncEnabled);
    }

    if (Number(backup.version ?? 1) >= 3) {
      for (const failure of Object.values(getRecord(data.syncFailures))) {
        const mediaType = failure?.mediaType === 'MANGA' ? 'MANGA' : 'ANIME';
        const mediaId = Number(failure?.mediaId);
        const operation = String(failure?.operation || '');
        if (
          !Number.isInteger(mediaId) ||
          mediaId <= 0 ||
          !['upsert_anilist_entry', 'delete_anilist_entry', 'upsert_anilist_manga_entry',
            'delete_anilist_manga_entry', 'upsert_mal_entry', 'delete_mal_entry',
            'upsert_mal_manga_entry', 'delete_mal_manga_entry'].includes(operation)
        ) {
          continue;
        }
        if (applySyncQueueFailureState({
          userId: currentSession.user.id,
          mediaType,
          mediaId,
          operation,
          attempts: failure.attempts,
          lastError: failure.lastError,
          excluded: Boolean(failure.excludedAt),
        })) {
          syncFailuresRestored += 1;
        }
      }
    }
  });
  restore();

  const imported = animeImported + mangaImported;
  const summary = [animeImported ? `${animeImported} Anime` : '', mangaImported ? `${mangaImported} Manga` : '']
    .filter(Boolean)
    .join(' and ');
  const preferencesRestored = Boolean(restoredSettings || isPlainRecord(data.portablePreferences));
  const restoredParts = [
    summary ? `${summary} entr${imported === 1 ? 'y' : 'ies'}` : '',
    preferencesRestored ? 'preferences and layouts' : '',
    pendingDeletionsRestored
      ? `${pendingDeletionsRestored} pending deletion${pendingDeletionsRestored === 1 ? '' : 's'}`
      : '',
    syncFailuresRestored
      ? `${syncFailuresRestored} sync recovery entr${syncFailuresRestored === 1 ? 'y' : 'ies'}`
      : '',
  ].filter(Boolean);
  return {
    ok: true,
    message: restoredParts.length
      ? `Restored ${restoredParts.join(' plus ')} from the backup${skipped ? `; skipped ${skipped} invalid entr${skipped === 1 ? 'y' : 'ies'}` : ''}.`
      : 'The backup was valid, but it did not contain any list entries.',
    imported,
    animeImported,
    mangaImported,
    skipped,
    settings: restoredSettings,
    portablePreferences: data.portablePreferences,
    desktopPreferences: data.desktopPreferences,
    backupVersion: Number(backup.version ?? 1),
    preferencesRestored,
    syncFailuresRestored,
    pendingDeletionsRestored,
  };
}

module.exports = { exportBackup, importBackup };
