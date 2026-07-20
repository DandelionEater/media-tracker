const {
  db,
  saveAnimeSummary,
  saveManga,
  upsertAnimeExternalId,
  getAnimeExternalIdByAnimeId,
  getUserAnimeList,
  getUserMangaList,
} = require('./db');
const { mapAnimeForDb } = require('./animeMapper');
const {
  saveMyAnimeEntry,
  saveMyMangaEntry,
} = require('./lists');
const { getSyncStatus, getSyncActivity, setAutoSyncEnabled } = require('./sync');

const BACKUP_FORMAT = 'seenary.local-backup';
const BACKUP_VERSION = 2;

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

  return result;
}

async function exportBackup(currentSession, settings) {
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

  const restore = db.transaction(() => {
    if (isPlainRecord(data.settings)) updateSettings(data.settings);

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

    if (Number(backup.version ?? 1) >= 2 && typeof data.autoSyncEnabled === 'boolean') {
      setAutoSyncEnabled(currentSession.user.id, data.autoSyncEnabled);
    }
  });
  restore();

  const imported = animeImported + mangaImported;
  const summary = [animeImported ? `${animeImported} Anime` : '', mangaImported ? `${mangaImported} Manga` : '']
    .filter(Boolean)
    .join(' and ');
  return {
    ok: true,
    message: summary
      ? `Imported ${summary} backup entr${imported === 1 ? 'y' : 'ies'}.`
      : 'The backup was valid, but it did not contain any list entries.',
    imported,
    animeImported,
    mangaImported,
    skipped,
  };
}

module.exports = { BACKUP_FORMAT, BACKUP_VERSION, exportBackup, importBackup, validBackup };
