const anilist = require('./anilist');
const mal = require('./mal');
const {
  getAnimeById,
  getAnimeExternalId,
  getAnimeExternalIdByAnimeId,
  upsertAnimeExternalId,
} = require('./db');

const MIN_RECOVERY_SCORE = 85;
const MIN_EXACT_TITLE_RECOVERY_SCORE = 75;
const MIN_STRONG_TITLE_RECOVERY_SCORE = 65;

function normalizeTitle(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function safeJsonParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function extractMalIdFromExternalLinks(anime) {
  const links = getAnimeExternalLinks(anime);

  for (const link of links) {
    const site = String(link?.site || link?.name || '').toLowerCase();
    const url = String(link?.url || '');

    if (!site.includes('myanimelist') && !url.includes('myanimelist.net/anime/')) {
      continue;
    }

    const match = url.match(/myanimelist\.net\/anime\/(\d+)/i);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

function getLocalAnimeTitles(anime) {
  return [
    anime?.title_preferred,
    anime?.title_english,
    anime?.title_romaji,
    anime?.title_native,
    anime?.title?.userPreferred,
    anime?.title?.english,
    anime?.title?.romaji,
    anime?.title?.native,
    ...safeJsonParse(anime?.synonyms, []),
    ...(Array.isArray(anime?.synonyms) ? anime.synonyms : []),
  ]
    .map((title) => String(title || '').trim())
    .filter(Boolean);
}

function getAnimeExternalLinks(anime) {
  if (Array.isArray(anime?.externalLinks)) {
    return anime.externalLinks;
  }

  return safeJsonParse(anime?.external_links, []);
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

function getMalCandidateTitles(candidate) {
  return [
    candidate?.title,
    candidate?.alternative_titles?.en,
    candidate?.alternative_titles?.ja,
    ...(candidate?.alternative_titles?.synonyms || []),
  ]
    .map((title) => String(title || '').trim())
    .filter(Boolean);
}

function getAnimeYear(anime) {
  if (anime?.season_year || anime?.seasonYear) {
    return Number(anime.season_year || anime.seasonYear);
  }

  if (anime?.start_date) {
    return Number(String(anime.start_date).slice(0, 4));
  }

  if (anime?.startDate?.year) {
    return Number(anime.startDate.year);
  }

  return null;
}

function scoreMalCandidate(anime, candidate) {
  const localTitles = new Set(getLocalAnimeTitles(anime).map(normalizeTitle));
  const candidateTitles = getMalCandidateTitles(candidate).map(normalizeTitle);
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

  const localEpisodes = Number(anime?.episodes);
  const malEpisodes = Number(candidate?.num_episodes);
  if (Number.isFinite(localEpisodes) && localEpisodes > 0 && Number.isFinite(malEpisodes) && malEpisodes > 0) {
    score += localEpisodes === malEpisodes ? 20 : -25;
  }

  const localYear = getAnimeYear(anime);
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

function hasExactTitleMatch(anime, candidate) {
  const localTitles = new Set(getLocalAnimeTitles(anime).map(normalizeTitle));
  return getMalCandidateTitles(candidate)
    .map(normalizeTitle)
    .some((title) => title && localTitles.has(title));
}

function hasStrongTitleMatch(anime, candidate) {
  const localTitles = getLocalAnimeTitles(anime).map(normalizeTitle);
  const candidateTitles = getMalCandidateTitles(candidate).map(normalizeTitle);

  return candidateTitles.some((candidateTitle) =>
    localTitles.some((localTitle) => isStrongTitleContainment(localTitle, candidateTitle))
  );
}

function canUseRecoveredCandidate(anime, best) {
  if (!best?.candidate) {
    return false;
  }

  if (best.score >= MIN_RECOVERY_SCORE) {
    return true;
  }

  if (best.score >= MIN_EXACT_TITLE_RECOVERY_SCORE && hasExactTitleMatch(anime, best.candidate)) {
    return true;
  }

  return best.score >= MIN_STRONG_TITLE_RECOVERY_SCORE && hasStrongTitleMatch(anime, best.candidate);
}

function isInvalidMalQueryError(error) {
  const rawMessage = String(error?.data?.message || error?.message || '').toLowerCase();
  return rawMessage === 'invalid q' || rawMessage.includes('rejected the title search query');
}

async function resolveMalAnimeIdForAnime(animeId, accessToken, options = {}) {
  const existing = getAnimeExternalIdByAnimeId('mal', animeId);

  if (existing?.external_id) {
    return existing.external_id;
  }

  let anime = getAnimeById(animeId);
  let linkedMalId = extractMalIdFromExternalLinks(anime);

  if (linkedMalId) {
    upsertAnimeExternalId({
      provider: 'mal',
      externalId: linkedMalId,
      animeId,
      submittedByUserId: options.submittedByUserId,
    });

    return linkedMalId;
  }

  let titles = getLocalAnimeTitles(anime);
  const seenCandidateIds = new Set();
  let best = null;

  async function scoreSearchTitles(searchTitles) {
    for (const title of searchTitles.flatMap(getMalSearchTitleVariants)) {
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
        if (!candidate?.id || seenCandidateIds.has(String(candidate.id))) {
          continue;
        }

        seenCandidateIds.add(String(candidate.id));

        const mapped = getAnimeExternalId('mal', candidate.id);
        if (mapped?.anime_id && Number(mapped.anime_id) !== Number(animeId)) {
          continue;
        }

        const score = scoreMalCandidate(anime, candidate);
        if (!best || score > best.score) {
          best = { candidate, score };
        }
      }
    }
  }

  await scoreSearchTitles(titles);

  if (!canUseRecoveredCandidate(anime, best)) {
    try {
      const freshAnime = await anilist.getAnimeDetails(animeId);
      linkedMalId = extractMalIdFromExternalLinks(freshAnime);

      if (linkedMalId) {
        upsertAnimeExternalId({
          provider: 'mal',
          externalId: linkedMalId,
          animeId,
          submittedByUserId: options.submittedByUserId,
        });

        return linkedMalId;
      }

      anime = {
        ...(anime || {}),
        ...(freshAnime || {}),
      };
      titles = getLocalAnimeTitles(anime);
      await scoreSearchTitles(titles);
    } catch {
      // Fresh AniList details improve mapping, but MAL sync can still try direct/search fallbacks.
    }
  }

  if (!canUseRecoveredCandidate(anime, best)) {
    try {
      const directCandidate = await mal.getAnimeDetails(animeId, { accessToken });
      const mapped = directCandidate?.id ? getAnimeExternalId('mal', directCandidate.id) : null;

      if (
        directCandidate?.id &&
        (!mapped?.anime_id || Number(mapped.anime_id) === Number(animeId))
      ) {
        const score = scoreMalCandidate(anime, directCandidate);
        if (!best || score > best.score) {
          best = { candidate: directCandidate, score };
        }
      }
    } catch {
      // Not every AniList ID matches a MAL ID; fall back to the normal no-match result.
    }
  }

  if (!canUseRecoveredCandidate(anime, best)) {
    return null;
  }

  upsertAnimeExternalId({
    provider: 'mal',
    externalId: best.candidate.id,
    animeId,
    submittedByUserId: options.submittedByUserId,
  });

  return String(best.candidate.id);
}

module.exports = {
  resolveMalAnimeIdForAnime,
};
