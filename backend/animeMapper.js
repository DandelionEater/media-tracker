function mapAnimeForDb(media) {
  return {
    id: media.id,
    is_adult: media.isAdult === null || media.isAdult === undefined ? null : media.isAdult ? 1 : 0,
    title_romaji: media.title?.romaji ?? null,
    title_english: media.title?.english ?? null,
    title_native: media.title?.native ?? null,
    title_preferred: media.title?.userPreferred ?? null,

    cover_image_large: media.coverImage?.extraLarge ?? media.coverImage?.large ?? null,
    banner_image: media.bannerImage ?? null,

    episodes: media.episodes ?? null,
    format: media.format ?? null,
    status: media.status ?? null,

    season: media.season ?? null,
    season_year: media.seasonYear ?? null,

    average_score: media.averageScore ?? null,
    mean_score: media.meanScore ?? null,
    popularity: media.popularity ?? null,
    favourites: media.favourites ?? null,
    duration: media.duration ?? null,
    source: media.source ?? null,
    country_of_origin: media.countryOfOrigin ?? null,
    start_date: mapFuzzyDate(media.startDate),
    franchise_start_date: mapFuzzyDate(media.franchiseStartDate ?? media.startDate),
    end_date: mapFuzzyDate(media.endDate),
    trailer_id: media.trailer?.id ?? null,
    trailer_site: media.trailer?.site ?? null,
    trailer_thumbnail: media.trailer?.thumbnail ?? null,
    site_url: media.siteUrl ?? null,

    description: media.description ?? null,

    genres: JSON.stringify(media.genres ?? []),
    synonyms: JSON.stringify(media.synonyms ?? []),

    next_airing_episode: media.nextAiringEpisode?.episode ?? null,
    next_airing_at: media.nextAiringEpisode?.airingAt ?? null,

    studios: JSON.stringify(media.studios?.nodes?.map((studio) => studio.name) ?? []),

    tags: mapTagsForDb(media.tags),
    staff: mapStaffForDb(media.staff?.edges),
    characters: mapCharactersForDb(media.characters?.edges),
    relations: JSON.stringify(mapRelations(media.relations?.edges)),
    recommendations: JSON.stringify(mapRecommendations(media.recommendations?.nodes)),
    external_links: JSON.stringify(media.externalLinks ?? []),
    streaming_episodes: JSON.stringify(media.streamingEpisodes ?? []),
  };
}

function mapDbAnimeForFrontend(row) {
  if (!row) return null;

  return {
    id: row.id,
    isAdult: Boolean(row.is_adult),
    title: {
      romaji: row.title_romaji,
      english: row.title_english,
      native: row.title_native,
      userPreferred: row.title_preferred,
    },
    coverImage: {
      extraLarge: row.cover_image_large,
      large: row.cover_image_large,
    },
    bannerImage: row.banner_image,
    episodes: row.episodes,
    format: row.format,
    status: row.status,
    season: row.season,
    seasonYear: row.season_year,
    averageScore: row.average_score,
    meanScore: row.mean_score,
    popularity: row.popularity,
    favourites: row.favourites,
    duration: row.duration,
    source: row.source,
    countryOfOrigin: row.country_of_origin,
    startDate: parseStoredDate(row.start_date),
    franchiseStartDate: parseStoredDate(row.franchise_start_date) ?? parseStoredDate(row.start_date),
    endDate: parseStoredDate(row.end_date),
    trailer:
      row.trailer_id || row.trailer_site || row.trailer_thumbnail
        ? {
            id: row.trailer_id,
            site: row.trailer_site,
            thumbnail: row.trailer_thumbnail,
          }
        : null,
    siteUrl: row.site_url,
    description: row.description,
    genres: JSON.parse(row.genres || '[]'),
    synonyms: JSON.parse(row.synonyms || '[]'),
    nextAiringEpisode:
      row.next_airing_episode || row.next_airing_at
        ? {
            episode: row.next_airing_episode,
            airingAt: row.next_airing_at,
          }
        : null,
    studios: {
      nodes: JSON.parse(row.studios || '[]').map((name) => ({ name })),
    },
    tags: row.tags ?? [],
    staff: {
      edges: row.staff ?? [],
    },
    characters: {
      edges: row.characters ?? [],
    },
    relations: {
      edges: JSON.parse(row.relations || '[]'),
    },
    recommendations: {
      nodes: JSON.parse(row.recommendations || '[]'),
    },
    externalLinks: JSON.parse(row.external_links || '[]'),
    streamingEpisodes: JSON.parse(row.streaming_episodes || '[]'),
  };
}

function mapFuzzyDate(date) {
  if (!date?.year) return null;

  const month = String(date.month || 1).padStart(2, '0');
  const day = String(date.day || 1).padStart(2, '0');
  return `${date.year}-${month}-${day}`;
}

function parseStoredDate(value) {
  if (!value) return null;

  const [year, month, day] = value.split('-').map(Number);

  return {
    year: Number.isFinite(year) ? year : null,
    month: Number.isFinite(month) ? month : null,
    day: Number.isFinite(day) ? day : null,
  };
}

function mapTagsForDb(tags = []) {
  return tags.map((tag) => ({
    tag_id: tag.id,
    name: tag.name ?? null,
    description: tag.description ?? null,
    rank: tag.rank ?? null,
    is_media_spoiler: tag.isMediaSpoiler ? 1 : 0,
    is_general_spoiler: tag.isGeneralSpoiler ? 1 : 0,
  }));
}

function mapStaffForDb(edges = []) {
  return edges.map((edge, index) => ({
    staff_id: edge.node?.id,
    name_full: edge.node?.name?.full ?? edge.node?.name?.userPreferred ?? null,
    name_native: edge.node?.name?.native ?? null,
    image_large: edge.node?.image?.large ?? null,
    role: edge.role ?? null,
    sort_order: index,
  }));
}

function mapCharactersForDb(edges = []) {
  return edges.map((edge, index) => ({
    character_id: edge.node?.id,
    name_full: edge.node?.name?.full ?? edge.node?.name?.userPreferred ?? null,
    name_native: edge.node?.name?.native ?? null,
    image_large: edge.node?.image?.large ?? null,
    role: edge.role ?? null,
    voice_actors: JSON.stringify(edge.voiceActors ?? []),
    sort_order: index,
  }));
}

function mapRelations(edges = []) {
  return edges.map((edge) => ({
    relationType: edge.relationType ?? null,
    node: mapRelatedMedia(edge.node),
  }));
}

function mapRecommendations(nodes = []) {
  return nodes.map((recommendation) => ({
    rating: recommendation.rating ?? null,
    mediaRecommendation: mapRelatedMedia(recommendation.mediaRecommendation),
  }));
}

function mapRelatedMedia(media) {
  if (!media) return null;

  return {
    id: media.id,
    type: media.type ?? null,
    title: media.title ?? null,
    coverImage: media.coverImage ?? null,
    description: media.description ?? null,
    format: media.format ?? null,
    status: media.status ?? null,
    episodes: media.episodes ?? null,
    season: media.season ?? null,
    seasonYear: media.seasonYear ?? null,
    averageScore: media.averageScore ?? null,
  };
}

module.exports = {
  mapAnimeForDb,
  mapDbAnimeForFrontend,
};
