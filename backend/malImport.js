const anilist = require('./anilist');
const {
  getAnimeById,
  getAnimeExternalId,
  saveAnimeSummary,
  upsertAnimeExternalId,
  getProviderMappingMiss,
  upsertProviderMappingMiss,
  deleteProviderMappingMiss,
} = require('./db');
const { mapAnimeForDb, mapDbAnimeForFrontend } = require('./animeMapper');
const { importAniListEntries } = require('./lists');

const IMPORT_STATUS_ORDER = ['watching', 'planned', 'completed', 'paused', 'dropped'];

function mapMalStatus(status) {
  switch (status) {
    case 'watching':
      return 'CURRENT';
    case 'completed':
      return 'COMPLETED';
    case 'on_hold':
      return 'PAUSED';
    case 'dropped':
      return 'DROPPED';
    case 'plan_to_watch':
      return 'PLANNING';
    default:
      return null;
  }
}

function mapMalDate(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    return null;
  }

  const [year, month, day] = String(value).split('-').map(Number);
  return { year, month, day };
}

function normalizeTitle(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getMalTitles(node) {
  return [
    node?.title,
    node?.alternative_titles?.en,
    node?.alternative_titles?.ja,
    ...(node?.alternative_titles?.synonyms || []),
  ]
    .map((title) => String(title || '').trim())
    .filter(Boolean);
}

function getMappingTitleSignature(node) {
  return getMalTitles(node).map(normalizeTitle).sort().join('|');
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

function scoreAniListCandidate(candidate, titles, malNode) {
  const normalizedTitles = new Set(titles.map(normalizeTitle));
  const candidateTitles = [
    candidate.title?.userPreferred,
    candidate.title?.english,
    candidate.title?.romaji,
    candidate.title?.native,
  ].map(normalizeTitle);
  let score = 0;

  if (candidateTitles.some((title) => normalizedTitles.has(title))) {
    score += 100;
  }

  if (malNode?.num_episodes && candidate.episodes === malNode.num_episodes) {
    score += 15;
  }

  const malYear = malNode?.start_date ? Number(String(malNode.start_date).slice(0, 4)) : null;
  if (malYear && candidate.seasonYear === malYear) {
    score += 10;
  }

  return score;
}

async function resolveAniListMediaForMalNode(malNode, cache) {
  const directCacheKey = `mal:${malNode?.id}`;
  if (cache.has(directCacheKey)) {
    return cache.get(directCacheKey);
  }

  const titles = getMalTitles(malNode);
  const mapped = getAnimeExternalId('mal', malNode?.id);

  if (mapped?.anime_id) {
    const cachedAnime = getAnimeById(mapped.anime_id);

    if (cachedAnime) {
      return mapDbAnimeForFrontend(cachedAnime);
    }

    const fetchedAnime = await anilist.getAnimeDetails(mapped.anime_id).catch(() => null);
    if (fetchedAnime?.id) {
      return fetchedAnime;
    }
  }

  for (const title of titles) {
    const key = normalizeTitle(title);
    if (cache.has(key)) {
      return cache.get(key);
    }

    const results = await anilist.searchAnime(title, { hideAdultContent: false }).catch(() => []);
    const mappedCandidate = mapped?.anime_id
      ? results.find((candidate) => Number(candidate.id) === Number(mapped.anime_id))
      : null;
    const scored = results
      .map((candidate) => ({
        candidate,
        score: scoreAniListCandidate(candidate, titles, malNode),
      }))
      .sort((left, right) => right.score - left.score);
    const best = mappedCandidate || (scored[0]?.score >= 80 ? scored[0].candidate : null);

    if (best) {
      cache.set(key, best);
      return best;
    }
  }

  return null;
}

async function buildAniListCollectionFromMalList(malList, options = {}) {
  const cache = new Map();
  const listsByStatus = new Map(IMPORT_STATUS_ORDER.map((status) => [status, []]));
  const entries = malList?.data || [];
  const emitProgress =
    typeof options.onProgress === 'function' ? options.onProgress : () => {};
  let mapped = 0;
  let skipped = 0;
  let skippedMissingStatus = 0;
  let skippedNoMatch = 0;
  const mappingFailures = [];

  throwIfCancelled(options);
  const validNodes = entries.map((item) => item?.node).filter((node) => node?.id);
  const unresolvedMalIds = [];
  for (const node of validNodes) {
    const storedMapping = getAnimeExternalId('mal', node.id);
    const cachedAnime = storedMapping?.anime_id ? getAnimeById(storedMapping.anime_id) : null;
    if (cachedAnime) {
      cache.set(`mal:${node.id}`, mapDbAnimeForFrontend(cachedAnime));
    } else {
      unresolvedMalIds.push(node.id);
    }
  }
  const exactMatches = await anilist.getMediaByMalIds(
    unresolvedMalIds,
    'ANIME'
  );
  for (const media of exactMatches) {
    if (!media?.id || !media?.idMal) continue;
    cache.set(`mal:${media.idMal}`, media);
    saveAnimeSummary(mapAnimeForDb(media));
    upsertAnimeExternalId({
      provider: 'mal',
      externalId: media.idMal,
      animeId: media.id,
      submittedByUserId: options.submittedByUserId,
    });
    deleteProviderMappingMiss('mal', 'ANIME', media.idMal);
  }

  let resolvedCount = 0;
  await mapWithConcurrency(entries, options.mappingConcurrency ?? 4, async (item, index) => {
    throwIfCancelled(options);
    const node = item?.node;
    const titleSignature = getMappingTitleSignature(node);
    let media = null;
    if (node?.id && !getProviderMappingMiss('mal', 'ANIME', node.id, titleSignature)) {
      media = await resolveAniListMediaForMalNode(node, cache);
      cache.set(`mal:${node.id}`, media || null);
      if (!media) {
        upsertProviderMappingMiss({
          provider: 'mal',
          mediaType: 'ANIME',
          externalId: node.id,
          titleSignature,
        });
      }
    }
    resolvedCount += 1;
    emitProgress({
      stage: 'mapping',
      current: resolvedCount,
      total: entries.length,
      entryTitle: node?.title || `MAL anime #${node?.id || index + 1}`,
    });
  });

  for (const [index, item] of entries.entries()) {
    throwIfCancelled(options);
    const node = item?.node;
    const listStatus = item?.list_status || node?.my_list_status || {};
    const status = mapMalStatus(listStatus.status);

    if (!node?.id || !status) {
      skipped += 1;
      skippedMissingStatus += 1;
      mappingFailures.push({
        malAnimeId: node?.id ?? null,
        title: node?.title || `MAL anime #${node?.id || index + 1}`,
        reason: 'missing_status',
        message: 'The MyAnimeList entry has no supported list status.',
      });
      continue;
    }

    const media = await resolveAniListMediaForMalNode(node, cache);

    if (!media?.id) {
      skipped += 1;
      skippedNoMatch += 1;
      mappingFailures.push({
        malAnimeId: node.id,
        title: node.title,
        reason: 'no_one_to_one_match',
        message:
          'No safe one-to-one AniList match was found. The providers may group this title differently.',
      });
      continue;
    }

    saveAnimeSummary(mapAnimeForDb(media));

    upsertAnimeExternalId({
      provider: 'mal',
      externalId: node.id,
      animeId: media.id,
      submittedByUserId: options.submittedByUserId,
    });

    const localStatus =
      status === 'CURRENT'
        ? 'watching'
        : status === 'PLANNING'
          ? 'planned'
          : status === 'COMPLETED'
            ? 'completed'
            : status === 'PAUSED'
              ? 'paused'
              : 'dropped';

    listsByStatus.get(localStatus)?.push({
      status,
      progress: listStatus.num_episodes_watched ?? 0,
      score: listStatus.score ?? null,
      notes: listStatus.comments ?? null,
      repeat: listStatus.num_times_rewatched ?? 0,
      startedAt: mapMalDate(listStatus.start_date),
      completedAt: mapMalDate(listStatus.finish_date),
      updatedAt: listStatus.updated_at ?? null,
      media,
      malAnimeId: node.id,
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
    skippedMissingStatus,
    skippedNoMatch,
    mappingFailures,
    sourceUsername: malList?.userName || '@me',
  };
}

function buildMalImportPreview(mappedList) {
  const grouped = Object.fromEntries(IMPORT_STATUS_ORDER.map((status) => [status, []]));

  for (const list of mappedList.collection.lists) {
    const localStatus = list.name;

    for (const entry of list.entries || []) {
      grouped[localStatus].push({
        animeId: entry.media.id,
        mediaId: entry.media.id,
        mediaType: 'ANIME',
        status: localStatus,
        progress: entry.progress ?? 0,
        score: entry.score ?? null,
        notes: entry.notes ?? null,
        title: {
          romaji: entry.media.title?.romaji ?? null,
          english: entry.media.title?.english ?? null,
          native: entry.media.title?.native ?? null,
          userPreferred:
            entry.media.title?.userPreferred ??
            entry.media.title?.english ??
            entry.media.title?.romaji ??
            entry.malTitle ??
            null,
        },
        coverImage: { large: entry.media.coverImage?.large ?? null },
        episodes: entry.media.episodes ?? null,
        format: entry.media.format ?? null,
        season: entry.media.season ?? null,
        seasonYear: entry.media.seasonYear ?? null,
        media: entry.media,
        source: {
          provider: 'mal',
          animeId: entry.malAnimeId,
          title: entry.malTitle,
        },
      });
    }
  }

  return {
    totalFound: mappedList.mapped,
    skipped: mappedList.skipped,
    skippedMissingStatus: mappedList.skippedMissingStatus,
    skippedNoMatch: mappedList.skippedNoMatch,
    mappingFailures: mappedList.mappingFailures,
    groups: IMPORT_STATUS_ORDER.map((status) => ({
      status,
      mediaType: 'ANIME',
      items: grouped[status],
    })),
  };
}

async function previewMalImport(malList, options = {}) {
  const mappedList = await buildAniListCollectionFromMalList(malList, options);
  return {
    username: mappedList.sourceUsername,
    preview: buildMalImportPreview(mappedList),
  };
}

async function importMalEntries(currentSession, malList, options = {}) {
  const mappedList = await buildAniListCollectionFromMalList(malList, {
    submittedByUserId: currentSession?.user?.id,
    onProgress: options.onProgress,
  });
  const result = importAniListEntries(currentSession, mappedList.collection, mappedList.sourceUsername, {
    selectedStatuses: options.selectedStatuses,
    selectedAnimeIds: options.selectedAnimeIds,
    selectionProvided: options.selectionProvided,
    sourceProvider: options.sourceProvider,
    onProgress: options.onImportProgress,
  });

  if (result.summary) {
    result.summary.sourceProvider = 'MyAnimeList';
    result.summary.skipped += mappedList.skipped;
    result.summary.mapped = mappedList.mapped;
    result.summary.unmapped = mappedList.skipped;
    result.summary.mappingFailures = mappedList.mappingFailures;
  }

  return {
    ...result,
    message: result.ok
      ? `Imported ${result.summary?.imported ?? 0} MyAnimeList entr${
          result.summary?.imported === 1 ? 'y' : 'ies'
        }. ${mappedList.skipped} entr${mappedList.skipped === 1 ? 'y was' : 'ies were'} skipped because no AniList match was found.`
      : result.message,
  };
}

module.exports = {
  previewMalImport,
  importMalEntries,
};
