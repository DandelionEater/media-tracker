const anilist = require('./anilist');
const { importAniListMangaEntries } = require('./lists');
const {
  saveManga,
  getMangaById,
  getMangaExternalId,
  upsertMangaExternalId,
  getProviderMappingMiss,
  upsertProviderMappingMiss,
  deleteProviderMappingMiss,
} = require('./db');

const IMPORT_STATUS_ORDER = ['watching', 'planned', 'completed', 'paused', 'dropped'];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeTitle(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function getMappingTitleSignature(node) {
  return [
    node?.title,
    node?.alternative_titles?.en,
    node?.alternative_titles?.ja,
    ...(node?.alternative_titles?.synonyms || []),
  ].map(normalizeTitle).filter(Boolean).sort().join('|');
}

function throwIfCancelled(options) {
  if (typeof options?.isCancelled === 'function' && options.isCancelled()) {
    const error = new Error('MyAnimeList operation cancelled.');
    error.code = 'MAL_JOB_CANCELLED';
    throw error;
  }
}

async function mapWithConcurrency(items, concurrency, worker) {
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

async function resolveAniListMangaByMalId(malMangaId) {
  try {
    return await anilist.getMangaDetailsByMalId(malMangaId);
  } catch (error) {
    if (Number(error?.status) !== 404) throw error;
    await delay(750);
    return await anilist.getMangaDetailsByMalId(malMangaId);
  }
}

function mapMalMangaStatus(status, isRereading = false) {
  switch (status) {
    case 'reading':
      return isRereading ? 'REPEATING' : 'CURRENT';
    case 'completed':
      return 'COMPLETED';
    case 'on_hold':
      return 'PAUSED';
    case 'dropped':
      return 'DROPPED';
    case 'plan_to_read':
      return 'PLANNING';
    default:
      return null;
  }
}

function mapMalDate(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return null;
  const [year, month, day] = String(value).split('-').map(Number);
  return { year, month, day };
}

async function buildAniListMangaCollectionFromMalList(malList, options = {}) {
  const listsByStatus = new Map(IMPORT_STATUS_ORDER.map((status) => [status, []]));
  const entries = malList?.data || [];
  const emitProgress =
    typeof options.onProgress === 'function' ? options.onProgress : () => {};
  let mapped = 0;
  let skipped = 0;
  const mappingFailures = [];

  throwIfCancelled(options);
  const mediaByMalId = new Map();
  const validNodes = entries.map((item) => item?.node).filter((node) => node?.id);
  const unresolvedMalIds = [];
  for (const node of validNodes) {
    const storedMapping = getMangaExternalId('mal', node.id);
    const cachedManga = storedMapping?.manga_id ? getMangaById(storedMapping.manga_id) : null;
    if (cachedManga?.details) {
      mediaByMalId.set(String(node.id), cachedManga.details);
    } else {
      unresolvedMalIds.push(node.id);
    }
  }
  const exactMatches = await anilist.getMediaByMalIds(
    unresolvedMalIds,
    'MANGA'
  );
  for (const media of exactMatches) {
    if (!media?.id || !media?.idMal) continue;
    mediaByMalId.set(String(media.idMal), media);
    saveManga(media);
    upsertMangaExternalId({ provider: 'mal', externalId: media.idMal, mangaId: media.id });
    deleteProviderMappingMiss('mal', 'MANGA', media.idMal);
  }

  let resolvedCount = 0;
  await mapWithConcurrency(entries, options.mappingConcurrency ?? 4, async (item, index) => {
    throwIfCancelled(options);
    const node = item?.node;
    const malMangaId = node?.id;
    let media = malMangaId ? mediaByMalId.get(String(malMangaId)) : null;
    const storedMapping = malMangaId ? getMangaExternalId('mal', malMangaId) : null;
    if (!media && storedMapping?.manga_id) {
      media = getMangaById(storedMapping.manga_id)?.details || null;
    }
    const titleSignature = getMappingTitleSignature(node);
    if (
      !media &&
      malMangaId &&
      !getProviderMappingMiss('mal', 'MANGA', malMangaId, titleSignature)
    ) {
      try {
        media = await resolveAniListMangaByMalId(malMangaId);
      } catch (error) {
        mappingFailures.push({
          malMangaId,
          title: node?.title || `MAL Manga #${malMangaId}`,
          message: error?.message || 'AniList mapping failed.',
        });
      }
      if (media?.id) {
        saveManga(media);
        upsertMangaExternalId({ provider: 'mal', externalId: malMangaId, mangaId: media.id });
        deleteProviderMappingMiss('mal', 'MANGA', malMangaId);
      } else {
        upsertProviderMappingMiss({
          provider: 'mal',
          mediaType: 'MANGA',
          externalId: malMangaId,
          titleSignature,
        });
      }
    }
    if (malMangaId) mediaByMalId.set(String(malMangaId), media || null);
    resolvedCount += 1;
    emitProgress({
      stage: 'mapping',
      current: resolvedCount,
      total: entries.length,
      entryTitle: node?.title || `MAL Manga #${malMangaId || index + 1}`,
    });
  });

  for (const [index, item] of entries.entries()) {
    throwIfCancelled(options);
    const node = item?.node;
    const listStatus = item?.list_status || node?.my_list_status || {};
    const remoteStatus = mapMalMangaStatus(listStatus.status, listStatus.is_rereading);
    const localStatus =
      remoteStatus === 'CURRENT' || remoteStatus === 'REPEATING'
        ? 'watching'
        : remoteStatus === 'PLANNING'
          ? 'planned'
          : remoteStatus === 'COMPLETED'
            ? 'completed'
            : remoteStatus === 'PAUSED'
              ? 'paused'
              : remoteStatus === 'DROPPED'
                ? 'dropped'
                : null;
    const entryTitle = node?.title || `MAL Manga #${node?.id || index + 1}`;

    if (!node?.id || !remoteStatus || !localStatus) {
      skipped += 1;
      continue;
    }

    const media = mediaByMalId.get(String(node.id)) || null;
    if (!media?.id) {
      skipped += 1;
      continue;
    }

    listsByStatus.get(localStatus)?.push({
      status: remoteStatus,
      progress: listStatus.num_chapters_read ?? 0,
      progressVolumes: listStatus.num_volumes_read ?? 0,
      score: Number(listStatus.score) > 0 ? Number(listStatus.score) : null,
      notes: listStatus.comments ?? null,
      repeat: listStatus.num_times_reread ?? 0,
      startedAt: mapMalDate(listStatus.start_date),
      completedAt: mapMalDate(listStatus.finish_date),
      updatedAt: listStatus.updated_at ?? null,
      media,
      malMangaId: node.id,
      malTitle: node.title,
    });
    mapped += 1;
  }

  return {
    collection: {
      lists: IMPORT_STATUS_ORDER.map((status) => ({
        name: status,
        entries: listsByStatus.get(status) || [],
      })),
    },
    mapped,
    skipped,
    mappingFailures,
    sourceUsername: malList?.userName || '@me',
  };
}

function buildMalMangaPreview(mappedList) {
  const localMangaEntries = [];

  for (const list of mappedList.collection.lists || []) {
    for (const entry of list.entries || []) {
      localMangaEntries.push({
        mangaId: entry.media.id,
        mediaType: 'MANGA',
        status: list.name,
        progress: entry.progress ?? 0,
        volumeProgress: entry.progressVolumes ?? 0,
        score: entry.score ?? null,
        notes: entry.notes ?? null,
        startedAt: entry.startedAt ?? null,
        completedAt: entry.completedAt ?? null,
        providerUpdatedAt: entry.updatedAt ?? null,
        repeatCount: entry.repeat ?? 0,
        isRereading: String(entry.status).toUpperCase() === 'REPEATING',
        title: entry.media.title,
        coverImage: entry.media.coverImage,
        chapters: entry.media.chapters ?? null,
        volumes: entry.media.volumes ?? null,
        format: entry.media.format ?? null,
        media: entry.media,
        source: { provider: 'mal', mangaId: entry.malMangaId, title: entry.malTitle },
      });
    }
  }

  return localMangaEntries;
}

function buildMalMangaImportPreview(mappedList) {
  const grouped = Object.fromEntries(IMPORT_STATUS_ORDER.map((status) => [status, []]));
  for (const item of buildMalMangaPreview(mappedList)) {
    grouped[item.status]?.push({
      ...item,
      animeId: item.mangaId,
      mediaId: item.mangaId,
    });
  }
  return {
    totalFound: mappedList.mapped,
    skipped: mappedList.skipped,
    mappingFailures: mappedList.mappingFailures,
    groups: IMPORT_STATUS_ORDER.map((status) => ({
      status,
      mediaType: 'MANGA',
      items: grouped[status],
    })),
  };
}

async function previewMalMangaPull(malList, options = {}) {
  const mappedList = await buildAniListMangaCollectionFromMalList(malList, options);
  return {
    username: mappedList.sourceUsername,
    localMangaEntries: buildMalMangaPreview(mappedList),
    preview: buildMalMangaImportPreview(mappedList),
    mapped: mappedList.mapped,
    skipped: mappedList.skipped,
    mappingFailures: mappedList.mappingFailures,
  };
}

async function importMalMangaEntries(currentSession, malList, options = {}) {
  const mappedList = await buildAniListMangaCollectionFromMalList(malList, options);
  const result = importAniListMangaEntries(
    currentSession,
    mappedList.collection,
    mappedList.sourceUsername,
    {
      sourceProvider: options.sourceProvider,
      selectedStatuses: options.selectedStatuses,
      selectedMangaIds: options.selectedMangaIds,
      selectionProvided: options.selectionProvided,
      onProgress: options.onImportProgress,
    }
  );
  if (result.summary) {
    result.summary.mapped = mappedList.mapped;
    result.summary.unmapped = mappedList.skipped;
    result.summary.mappingFailures = mappedList.mappingFailures;
    result.summary.skipped += mappedList.skipped;
  }
  return result;
}

module.exports = {
  previewMalMangaPull,
  importMalMangaEntries,
};
