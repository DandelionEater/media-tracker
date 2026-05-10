const mal = require('./mal');
const {
  getAnimeById,
  getAnimeExternalId,
  getAnimeExternalIdByAnimeId,
  upsertAnimeExternalId,
} = require('./db');

const MIN_RECOVERY_SCORE = 85;

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

function getLocalAnimeTitles(anime) {
  return [
    anime?.title_preferred,
    anime?.title_english,
    anime?.title_romaji,
    anime?.title_native,
    ...safeJsonParse(anime?.synonyms, []),
  ]
    .map((title) => String(title || '').trim())
    .filter(Boolean);
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
  if (anime?.season_year) {
    return Number(anime.season_year);
  }

  if (anime?.start_date) {
    return Number(String(anime.start_date).slice(0, 4));
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

async function resolveMalAnimeIdForAnime(animeId, accessToken) {
  const existing = getAnimeExternalIdByAnimeId('mal', animeId);

  if (existing?.external_id) {
    return existing.external_id;
  }

  const anime = getAnimeById(animeId);
  const titles = getLocalAnimeTitles(anime);
  const seenCandidateIds = new Set();
  let best = null;

  for (const title of titles) {
    const candidates = await mal.searchAnime(title, { accessToken, limit: 10 });

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

  if (!best || best.score < MIN_RECOVERY_SCORE) {
    return null;
  }

  upsertAnimeExternalId({
    provider: 'mal',
    externalId: best.candidate.id,
    animeId,
  });

  return String(best.candidate.id);
}

module.exports = {
  resolveMalAnimeIdForAnime,
};
