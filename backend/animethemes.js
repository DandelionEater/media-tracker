const fetch = require('node-fetch');

const ANIMETHEMES_GRAPHQL_URL =
  process.env.ANIMETHEMES_GRAPHQL_URL || 'https://graphql.animethemes.moe/';
const REQUEST_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_LIMIT = 100;
const MAX_SONG_MATCHES = 6;
const MAX_ASSOCIATIONS = 24;
const MAX_ARTIST_MATCHES = 3;
const ARTIST_SEARCH_PERFORMANCE_LIMIT = 7;
const ARTIST_CATALOG_PAGE_SIZE = 12;
const searchCache = new Map();
const animeMusicCache = new Map();

const THEME_ASSOCIATION_FIELDS = `
  id
  title {
    romaji
    native
  }
  performances {
    alias
    as
    artist {
      id
      name {
        main
        native
      }
    }
  }
  animethemes {
    id
    type
    sequence
    animethemeentries(nsfw: false, spoiler: false, first: 1, page: 1) {
      id
      videos(first: 1) {
        nodes {
          audio {
            link
            mimetype
          }
        }
      }
    }
    anime {
      id
      title {
        romaji
        english
        native
      }
      resources(first: 20) {
        nodes {
          site
          externalId
        }
      }
    }
  }
`;

const SEARCH_MUSIC_QUERY = `
  query SearchMusic($search: String!) {
    search(search: $search, first: 10, page: 1) {
      songs {
        ${THEME_ASSOCIATION_FIELDS}
      }
      artists {
        id
        slug
        name {
          main
          native
        }
        synonyms {
          text
        }
        performances(first: ${ARTIST_SEARCH_PERFORMANCE_LIMIT}, page: 1) {
          alias
          as
          memberAlias
          memberAs
          song {
            ${THEME_ASSOCIATION_FIELDS}
          }
        }
        memberPerformances(first: ${ARTIST_SEARCH_PERFORMANCE_LIMIT}, page: 1) {
          alias
          as
          memberAlias
          memberAs
          song {
            ${THEME_ASSOCIATION_FIELDS}
          }
        }
      }
    }
  }
`;

const ARTIST_CATALOG_QUERY = `
  query ArtistCatalog($slug: String!, $page: Int!) {
    artist(slug: $slug) {
      id
      slug
      name {
        main
        native
      }
      performances(first: ${ARTIST_CATALOG_PAGE_SIZE}, page: $page) {
        alias
        as
        memberAlias
        memberAs
        song {
          ${THEME_ASSOCIATION_FIELDS}
        }
      }
      memberPerformances(first: ${ARTIST_CATALOG_PAGE_SIZE}, page: $page) {
        alias
        as
        memberAlias
        memberAs
        song {
          ${THEME_ASSOCIATION_FIELDS}
        }
      }
    }
  }
`;

const ANIME_MUSIC_QUERY = `
  query AnimeMusic($search: String!) {
    search(search: $search, first: 10, page: 1) {
      anime {
        id
        title {
          romaji
          english
          native
        }
        resources(first: 20) {
          nodes {
            site
            externalId
          }
        }
        animethemes(first: 30, page: 1) {
          id
          type
          sequence
          song {
            id
            title {
              romaji
              native
            }
            performances {
              alias
              as
              artist {
                id
                name {
                  main
                  native
                }
              }
            }
          }
          animethemeentries(nsfw: false, spoiler: false, first: 1, page: 1) {
            id
            videos(first: 1) {
              nodes {
                audio {
                  link
                  mimetype
                }
              }
            }
          }
        }
      }
    }
  }
`;

async function searchMusic(search) {
  const query = String(search || '').trim();
  const normalizedQuery = normalizeMusicSearchTerm(query);

  if (normalizedQuery.length < 2) {
    return { songs: [], artists: [] };
  }

  const cached = searchCache.get(normalizedQuery);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return cached.items;
  }

  const payload = await requestWithRetry(SEARCH_MUSIC_QUERY, { search: query });
  const items = {
    songs: mapSongSearchResponse(payload, query),
    artists: mapArtistSearchResponse(payload, query),
  };

  if (searchCache.size >= CACHE_LIMIT) {
    const oldestKey = searchCache.keys().next().value;
    if (oldestKey) searchCache.delete(oldestKey);
  }
  searchCache.set(normalizedQuery, {
    createdAt: Date.now(),
    items,
  });

  return items;
}

async function searchSongs(search) {
  return (await searchMusic(search)).songs;
}

async function getArtistThemeAssociations(slug, page = 1) {
  const normalizedSlug = String(slug || '').trim();
  const normalizedPage = Math.max(1, Number.parseInt(page, 10) || 1);
  if (!normalizedSlug) {
    throw new Error('An AnimeThemes artist slug is required.');
  }

  const payload = await requestWithRetry(ARTIST_CATALOG_QUERY, {
    slug: normalizedSlug,
    page: normalizedPage,
  });
  const artist = payload?.data?.artist;
  if (!artist || !Number.isInteger(Number(artist.id))) {
    throw new Error('AnimeThemes artist was not found.');
  }

  const direct = Array.isArray(artist.performances) ? artist.performances : [];
  const member = Array.isArray(artist.memberPerformances)
    ? artist.memberPerformances
    : [];
  const hasNextPage =
    direct.length === ARTIST_CATALOG_PAGE_SIZE ||
    member.length === ARTIST_CATALOG_PAGE_SIZE;
  const artistIdentity = mapArtistIdentity(artist);
  const items = mapArtistPerformances(
    artistIdentity,
    interleavePerformances(direct, member),
    ARTIST_CATALOG_PAGE_SIZE
  );

  return {
    artist: artistIdentity,
    items,
    pageInfo: {
      currentPage: normalizedPage,
      hasNextPage,
    },
  };
}

async function getAnimeThemeMusic(anilistId, titles = []) {
  const normalizedAnilistId = Number(anilistId);
  if (!Number.isInteger(normalizedAnilistId) || normalizedAnilistId <= 0) {
    throw new Error('A valid AniList anime ID is required.');
  }

  const cached = animeMusicCache.get(normalizedAnilistId);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return cached.items;
  }

  const searchTitles = Array.from(
    new Set(
      (Array.isArray(titles) ? titles : [titles])
        .map(cleanOptionalString)
        .filter(Boolean)
    )
  ).slice(0, 4);
  let matchedAnime = null;

  for (const title of searchTitles) {
    const payload = await requestWithRetry(ANIME_MUSIC_QUERY, { search: title });
    matchedAnime = (payload?.data?.search?.anime ?? []).find(
      (anime) =>
        getExternalAnimeId(anime?.resources?.nodes, 'ANILIST') ===
        normalizedAnilistId
    );
    if (matchedAnime) break;
  }

  const items = matchedAnime ? mapAnimeThemeMusic(matchedAnime) : [];
  if (animeMusicCache.size >= CACHE_LIMIT) {
    const oldestKey = animeMusicCache.keys().next().value;
    if (oldestKey) animeMusicCache.delete(oldestKey);
  }
  animeMusicCache.set(normalizedAnilistId, { createdAt: Date.now(), items });
  return items;
}

function mapAnimeThemeMusic(anime) {
  const items = new Map();
  for (const theme of anime?.animethemes ?? []) {
    const song = theme?.song;
    if (
      !Number.isInteger(Number(song?.id)) ||
      !Number.isInteger(Number(theme?.id)) ||
      (theme?.type !== 'OP' && theme?.type !== 'ED')
    ) {
      continue;
    }

    const artists = dedupeArtists(
      (song.performances ?? []).map((performance) => ({
        id: Number(performance?.artist?.id),
        name:
          performance?.alias ||
          performance?.as ||
          performance?.artist?.name?.main ||
          performance?.artist?.name?.native ||
          'Unknown artist',
      }))
    );
    items.set(`${song.id}:${theme.id}`, {
      song: {
        id: Number(song.id),
        title: {
          romaji: cleanOptionalString(song?.title?.romaji),
          native: cleanOptionalString(song?.title?.native),
        },
        artists,
      },
      theme: {
        id: Number(theme.id),
        type: theme.type,
        sequence:
          theme.sequence !== null &&
          theme.sequence !== undefined &&
          Number.isInteger(Number(theme.sequence))
          ? Number(theme.sequence)
          : null,
      },
      previewUrl: getThemePreviewUrl(theme),
    });
  }

  return Array.from(items.values()).sort((left, right) => {
    if (left.theme.type !== right.theme.type) {
      return left.theme.type === 'OP' ? -1 : 1;
    }
    return (left.theme.sequence ?? 1) - (right.theme.sequence ?? 1);
  });
}

function interleavePerformances(direct, member) {
  const items = [];
  const longest = Math.max(direct.length, member.length);
  for (let index = 0; index < longest; index += 1) {
    if (direct[index]) items.push(direct[index]);
    if (member[index]) items.push(member[index]);
  }
  return items;
}

async function requestWithRetry(query, variables, attempts = 2) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await request(query, variables);
    } catch (error) {
      lastError = error;

      if (!isRetryableError(error) || attempt === attempts) {
        break;
      }

      const retryAfterMs =
        Number.isFinite(error.retryAfter) && error.retryAfter > 0
          ? error.retryAfter * 1000
          : 900 * attempt;
      await delay(retryAfterMs);
    }
  }

  throw lastError;
}

async function request(query, variables) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  let payload;

  try {
    response = await fetch(ANIMETHEMES_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
    payload = await response.json();
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('AnimeThemes search timed out.');
      timeoutError.status = 408;
      timeoutError.retryable = true;
      throw timeoutError;
    }

    const transportError = new Error(
      error?.message
        ? `AnimeThemes request failed: ${error.message}`
        : 'AnimeThemes request failed before a response was received.'
    );
    transportError.retryable = true;
    transportError.cause = error;
    throw transportError;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok || payload?.errors?.length) {
    const error = new Error(
      payload?.errors?.[0]?.message ||
        `AnimeThemes request failed with status ${response.status}.`
    );
    error.status = response.status;
    error.retryAfter = Number(response.headers.get('retry-after')) || null;
    throw error;
  }

  if (!payload?.data) {
    const error = new Error('AnimeThemes returned an unexpected GraphQL response.');
    error.retryable = false;
    throw error;
  }

  return payload;
}

function mapSongSearchResponse(payload, search) {
  const normalizedQuery = normalizeMusicSearchTerm(search);
  const songs = Array.isArray(payload?.data?.search?.songs)
    ? payload.data.search.songs
    : [];

  return songs
    .map((song, providerIndex) => ({
      song,
      providerIndex,
      rank: getSongMatchRank(song?.title, normalizedQuery),
    }))
    .filter(({ song, rank }) => Number.isInteger(Number(song?.id)) && rank !== null)
    .sort((left, right) => left.rank - right.rank || left.providerIndex - right.providerIndex)
    .slice(0, MAX_SONG_MATCHES)
    .flatMap(({ song }) => mapSongAssociations(song))
    .slice(0, MAX_ASSOCIATIONS);
}

function mapArtistSearchResponse(payload, search) {
  const normalizedQuery = normalizeMusicSearchTerm(search);
  const artists = Array.isArray(payload?.data?.search?.artists)
    ? payload.data.search.artists
    : [];

  return artists
    .map((artist, providerIndex) => ({
      artist,
      providerIndex,
      rank: getArtistMatchRank(artist, normalizedQuery),
    }))
    .filter(({ artist, rank }) => {
      return (
        Number.isInteger(Number(artist?.id)) &&
        cleanOptionalString(artist?.slug) &&
        rank !== null
      );
    })
    .sort((left, right) => left.rank - right.rank || left.providerIndex - right.providerIndex)
    .slice(0, MAX_ARTIST_MATCHES)
    .flatMap(({ artist }) => {
      const identity = mapArtistIdentity(artist);
      return mapArtistPerformances(
        identity,
        [
          ...(Array.isArray(artist.performances) ? artist.performances : []),
          ...(Array.isArray(artist.memberPerformances)
            ? artist.memberPerformances
            : []),
        ],
        MAX_ASSOCIATIONS
      );
    });
}

function mapArtistIdentity(artist) {
  return {
    id: Number(artist.id),
    slug: cleanOptionalString(artist.slug),
    name:
      cleanOptionalString(artist?.name?.main) ||
      cleanOptionalString(artist?.name?.native) ||
      'Unknown artist',
    nativeName: cleanOptionalString(artist?.name?.native),
  };
}

function mapArtistPerformances(artist, performances, limit) {
  const associations = new Map();

  for (const performance of performances) {
    const creditedAs =
      cleanOptionalString(performance?.memberAlias) ||
      cleanOptionalString(performance?.memberAs) ||
      cleanOptionalString(performance?.alias) ||
      cleanOptionalString(performance?.as) ||
      null;

    for (const association of mapSongAssociations(performance?.song)) {
      const key = `${artist.id}:${association.song.id}:${association.theme.id}:${association.anilistId}`;
      if (associations.has(key)) continue;

      associations.set(key, {
        ...association,
        artist,
        creditedAs,
      });
      if (associations.size >= limit) {
        return Array.from(associations.values());
      }
    }
  }

  return Array.from(associations.values());
}

function mapSongAssociations(song) {
  const artists = dedupeArtists(
    (song?.performances ?? []).map((performance) => ({
      id: Number(performance?.artist?.id),
      name:
        performance?.alias ||
        performance?.as ||
        performance?.artist?.name?.main ||
        performance?.artist?.name?.native ||
        'Unknown artist',
    }))
  );

  return (song?.animethemes ?? []).flatMap((theme) => {
    const anilistId = getExternalAnimeId(theme?.anime?.resources?.nodes, 'ANILIST');
    if (!anilistId || (theme?.type !== 'OP' && theme?.type !== 'ED')) {
      return [];
    }

    return [
      {
        song: {
          id: Number(song.id),
          title: {
            romaji: cleanOptionalString(song?.title?.romaji),
            native: cleanOptionalString(song?.title?.native),
          },
          artists,
        },
        theme: {
          id: Number(theme.id),
          type: theme.type,
          sequence:
            theme.sequence !== null &&
            theme.sequence !== undefined &&
            Number.isInteger(Number(theme.sequence))
            ? Number(theme.sequence)
            : null,
        },
        animeThemesAnime: {
          id: Number(theme?.anime?.id),
          title: {
            romaji: cleanOptionalString(theme?.anime?.title?.romaji),
            english: cleanOptionalString(theme?.anime?.title?.english),
            native: cleanOptionalString(theme?.anime?.title?.native),
          },
        },
        anilistId,
        previewUrl: getThemePreviewUrl(theme),
      },
    ];
  });
}

function getArtistMatchRank(artist, normalizedQuery) {
  const candidates = [
    artist?.name?.main,
    artist?.name?.native,
    ...(Array.isArray(artist?.synonyms)
      ? artist.synonyms.map((synonym) => synonym?.text)
      : []),
  ]
    .map(normalizeMusicSearchTerm)
    .filter(Boolean);

  if (candidates.some((candidate) => candidate === normalizedQuery)) return 0;
  if (candidates.some((candidate) => candidate.startsWith(normalizedQuery))) return 1;
  if (candidates.some((candidate) => candidate.includes(normalizedQuery))) return 2;
  return null;
}

function getSongMatchRank(title, normalizedQuery) {
  const candidates = [title?.romaji, title?.native]
    .map(normalizeMusicSearchTerm)
    .filter(Boolean);

  if (candidates.some((candidate) => candidate === normalizedQuery)) return 0;
  if (candidates.some((candidate) => candidate.startsWith(normalizedQuery))) return 1;
  if (candidates.some((candidate) => candidate.includes(normalizedQuery))) return 2;
  return null;
}

function normalizeMusicSearchTerm(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function getExternalAnimeId(resources, site) {
  const match = (Array.isArray(resources) ? resources : []).find(
    (resource) => resource?.site === site
  );
  const externalId = Number(match?.externalId);
  return Number.isInteger(externalId) && externalId > 0 ? externalId : null;
}

function getThemePreviewUrl(theme) {
  const entries = Array.isArray(theme?.animethemeentries)
    ? theme.animethemeentries
    : [];

  for (const entry of entries) {
    const videos = Array.isArray(entry?.videos?.nodes) ? entry.videos.nodes : [];

    for (const video of videos) {
      const link = cleanOptionalString(video?.audio?.link);
      const mimetype = cleanOptionalString(video?.audio?.mimetype);

      if (link && mimetype === 'audio/ogg' && isAllowedPreviewUrl(link)) {
        return link;
      }
    }
  }

  return null;
}

function isAllowedPreviewUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'a.animethemes.moe';
  } catch {
    return false;
  }
}

function dedupeArtists(artists) {
  return Array.from(
    new Map(
      artists
        .filter((artist) => Number.isInteger(artist.id) && artist.id > 0)
        .map((artist) => [artist.id, artist])
    ).values()
  );
}

function cleanOptionalString(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || null;
}

function isRetryableError(error) {
  const status = Number(error?.status);
  return (
    error?.retryable === true ||
    status === 408 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  getAnimeThemeMusic,
  getArtistThemeAssociations,
  mapArtistSearchResponse,
  mapSongSearchResponse,
  normalizeMusicSearchTerm,
  searchMusic,
  searchSongs,
};
