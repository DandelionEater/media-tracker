const fetch = require('node-fetch');

const ANILIST_URL = 'https://graphql.anilist.co';

const USER_IMPORT_NOT_FOUND_MESSAGE =
  "We couldn't find that AniList user or list. Make sure the username is typed correctly, make sure the account is public, or try another username.";

async function anilistRequest(query, variables = {}, accessToken = null) {
  const res = await fetch(ANILIST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });

  const data = await res.json();

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(USER_IMPORT_NOT_FOUND_MESSAGE);
    }

    const retryAfter = Number(res.headers.get('retry-after'));

    if (data?.errors?.length) {
      const error = new Error(
        data.errors[0]?.message || `AniList request failed with status ${res.status}`
      );
      error.status = res.status;
      error.retryAfter = Number.isFinite(retryAfter) ? retryAfter : null;
      throw error;
    }

    const error = new Error(data?.message || `AniList request failed with status ${res.status}`);
    error.status = res.status;
    error.retryAfter = Number.isFinite(retryAfter) ? retryAfter : null;
    throw error;
  }

  if (data.errors?.length) {
    throw new Error(data.errors[0]?.message || 'AniList returned an error.');
  }

  return data;
}

async function anilistRequestWithRetry(query, variables = {}, accessToken = null, attempts = 3) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await anilistRequest(query, variables, accessToken);
    } catch (error) {
      lastError = error;

      if (!isRateLimitError(error) || attempt === attempts) {
        break;
      }

      const retryAfterMs =
        typeof error.retryAfter === 'number' && error.retryAfter > 0
          ? error.retryAfter * 1000
          : 2200 * attempt;
      await delay(retryAfterMs);
    }
  }

  throw lastError;
}

function isRateLimitError(error) {
  return error?.status === 429 || /too many requests/i.test(error?.message || '');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function searchAnime(search, options = {}) {
  const hideAdultContent = options.hideAdultContent !== false;
  const query = `
    query ($search: String, $isAdult: Boolean) {
      Page(perPage: 10) {
        media(search: $search, type: ANIME, isAdult: $isAdult) {
          id
          isAdult
          title {
            romaji
            english
            userPreferred
          }
          coverImage {
            large
          }
          episodes
          format
          averageScore
          season
          seasonYear
        }
      }
    }
  `;

  const data = await anilistRequest(query, {
    search,
    isAdult: hideAdultContent ? false : undefined,
  });
  return data.data.Page.media;
}

async function getTrendingAnime(options = {}) {
  const hideAdultContent = options.hideAdultContent !== false;
  const query = `
    query ($isAdult: Boolean) {
      Page(page: 1, perPage: 8) {
        media(type: ANIME, status: RELEASING, sort: TRENDING_DESC, isAdult: $isAdult) {
          id
          isAdult
          title {
            romaji
            english
            native
            userPreferred
          }
          coverImage {
            large
          }
          bannerImage
          episodes
          format
          status
          season
          seasonYear
          averageScore
          meanScore
          popularity
          favourites
          nextAiringEpisode {
            episode
            airingAt
          }
        }
      }
    }
  `;

  const data = await anilistRequest(query, {
    isAdult: hideAdultContent ? false : undefined,
  });
  return data.data.Page.media;
}

async function getDiscoverAnime(options = {}) {
  const hideAdultContent = options.hideAdultContent !== false;
  const { currentSeason, currentYear, nextSeason, nextYear } = getSeasonWindows();
  const query = `
    query (
      $isAdult: Boolean,
      $currentSeason: MediaSeason,
      $currentYear: Int,
      $nextSeason: MediaSeason,
      $nextYear: Int
    ) {
      seasonal: Page(page: 1, perPage: 10) {
        media(
          type: ANIME,
          season: $currentSeason,
          seasonYear: $currentYear,
          sort: POPULARITY_DESC,
          isAdult: $isAdult
        ) {
          ...DiscoverMedia
        }
      }
      upcoming: Page(page: 1, perPage: 10) {
        media(
          type: ANIME,
          season: $nextSeason,
          seasonYear: $nextYear,
          sort: POPULARITY_DESC,
          isAdult: $isAdult
        ) {
          ...DiscoverMedia
        }
      }
      popular: Page(page: 1, perPage: 10) {
        media(type: ANIME, sort: POPULARITY_DESC, isAdult: $isAdult) {
          ...DiscoverMedia
        }
      }
      highlyRated: Page(page: 1, perPage: 10) {
        media(type: ANIME, sort: SCORE_DESC, isAdult: $isAdult) {
          ...DiscoverMedia
        }
      }
    }

    fragment DiscoverMedia on Media {
      id
      isAdult
      title {
        romaji
        english
        native
        userPreferred
      }
      coverImage {
        large
      }
      bannerImage
      episodes
      format
      status
      season
      seasonYear
      averageScore
      meanScore
      popularity
      favourites
      nextAiringEpisode {
        episode
        airingAt
      }
    }
  `;

  const data = await anilistRequest(query, {
    isAdult: hideAdultContent ? false : undefined,
    currentSeason,
    currentYear,
    nextSeason,
    nextYear,
  });

  return [
    {
      id: 'seasonal',
      title: 'Seasonal Picks',
      description: `Popular anime airing in ${formatSeasonLabel(currentSeason)} ${currentYear}.`,
      pills: [formatSeasonLabel(currentSeason), String(currentYear), 'Seasonal'],
      items: data.data.seasonal.media,
    },
    {
      id: 'upcoming',
      title: 'Next Season',
      description: `Anime gathering attention for ${formatSeasonLabel(nextSeason)} ${nextYear}.`,
      pills: [formatSeasonLabel(nextSeason), String(nextYear), 'Upcoming'],
      items: data.data.upcoming.media,
    },
    {
      id: 'popular',
      title: 'Popular',
      description: 'The most-watched anime across AniList.',
      pills: ['Popularity', 'All time'],
      items: data.data.popular.media,
    },
    {
      id: 'rated',
      title: 'Highly Rated',
      description: 'Anime ranked by community score.',
      pills: ['Score', 'Community'],
      items: data.data.highlyRated.media,
    },
  ];
}

async function getDiscoverShelfAnime(options = {}) {
  const hideAdultContent = options.hideAdultContent !== false;
  const definition = getDiscoverShelfDefinition(options.shelfId);
  const page = clampInteger(options.page, 1, 500, 1);
  const perPage = clampInteger(options.perPage, 1, 20, 20);
  const maxItems = definition.expandedLimit ?? Number.POSITIVE_INFINITY;
  const maxPage = Number.isFinite(maxItems) ? Math.ceil(maxItems / perPage) : 500;
  const safePage = Math.min(page, maxPage);
  const data = await fetchDiscoverShelfPage(definition, {
    page: safePage,
    perPage,
    hideAdultContent,
  });
  const pageInfo = data.data.Page.pageInfo;
  const isCapped = Number.isFinite(maxItems);
  const cappedTotal = isCapped
    ? Math.min(pageInfo.total ?? maxItems, maxItems)
    : null;
  const cappedLastPage = isCapped
    ? Math.min(pageInfo.lastPage ?? maxPage, maxPage)
    : pageInfo.lastPage;
  const items = isCapped
    ? data.data.Page.media.slice(0, Math.max(0, maxItems - (safePage - 1) * perPage))
    : data.data.Page.media;
  const hasNextPage = Boolean(pageInfo.hasNextPage) && safePage < cappedLastPage;
  const effectiveTotal = isCapped
    ? cappedTotal
    : hasNextPage
    ? null
    : (safePage - 1) * perPage + items.length;

  return {
    id: definition.id,
    title: definition.title,
    description: definition.description,
    pills: definition.pills,
    pageInfo: {
      currentPage: safePage,
      lastPage: hasNextPage ? safePage + 1 : safePage,
      hasNextPage,
      total: effectiveTotal,
      perPage,
    },
    items,
  };
}

async function fetchDiscoverShelfPage(definition, { page, perPage, hideAdultContent }) {
  const query = `
    query (
      $page: Int,
      $perPage: Int,
      $isAdult: Boolean,
      $season: MediaSeason,
      $seasonYear: Int,
      $sort: [MediaSort]
    ) {
      Page(page: $page, perPage: $perPage) {
        pageInfo {
          currentPage
          lastPage
          hasNextPage
          total
          perPage
        }
        media(
          type: ANIME,
          season: $season,
          seasonYear: $seasonYear,
          sort: $sort,
          isAdult: $isAdult
        ) {
          id
          isAdult
          title {
            romaji
            english
            native
            userPreferred
          }
          coverImage {
            large
          }
          episodes
          format
          season
          seasonYear
          averageScore
          meanScore
          popularity
        }
      }
    }
  `;

  return await anilistRequestWithRetry(query, {
    page,
    perPage,
    isAdult: hideAdultContent ? false : undefined,
    season: definition.season,
    seasonYear: definition.seasonYear,
    sort: definition.sort,
  });
}

function getDiscoverShelfDefinition(shelfId) {
  const { currentSeason, currentYear, nextSeason, nextYear } = getSeasonWindows();
  const definitions = {
    seasonal: {
      id: 'seasonal',
      title: 'Seasonal Picks',
      description: `Popular anime airing in ${formatSeasonLabel(currentSeason)} ${currentYear}.`,
      pills: [formatSeasonLabel(currentSeason), String(currentYear), 'Seasonal'],
      season: currentSeason,
      seasonYear: currentYear,
      sort: ['POPULARITY_DESC'],
    },
    upcoming: {
      id: 'upcoming',
      title: 'Next Season',
      description: `Anime gathering attention for ${formatSeasonLabel(nextSeason)} ${nextYear}.`,
      pills: [formatSeasonLabel(nextSeason), String(nextYear), 'Upcoming'],
      season: nextSeason,
      seasonYear: nextYear,
      sort: ['POPULARITY_DESC'],
    },
    popular: {
      id: 'popular',
      title: 'Popular',
      description: 'The most-watched anime across AniList.',
      pills: ['Popularity', 'All time'],
      season: undefined,
      seasonYear: undefined,
      sort: ['POPULARITY_DESC'],
      expandedLimit: 100,
    },
    rated: {
      id: 'rated',
      title: 'Highly Rated',
      description: 'Anime ranked by community score.',
      pills: ['Score', 'Community'],
      season: undefined,
      seasonYear: undefined,
      sort: ['SCORE_DESC'],
      expandedLimit: 100,
    },
  };

  return definitions[shelfId] || definitions.seasonal;
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.trunc(number)));
}

function getSeasonWindows(date = new Date()) {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  const seasons = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];
  const currentIndex = month <= 3 ? 0 : month <= 6 ? 1 : month <= 9 ? 2 : 3;
  const nextIndex = (currentIndex + 1) % seasons.length;

  return {
    currentSeason: seasons[currentIndex],
    currentYear: year,
    nextSeason: seasons[nextIndex],
    nextYear: nextIndex === 0 ? year + 1 : year,
  };
}

function formatSeasonLabel(season) {
  return season.charAt(0) + season.slice(1).toLowerCase();
}

async function getUserAnimeCollection(userName) {
  const query = `
    query ($userName: String) {
      MediaListCollection(
        userName: $userName
        type: ANIME
        forceSingleCompletedList: true
      ) {
        lists {
          name
          status
          entries {
            status
            progress
            repeat
            notes
            score(format: POINT_10_DECIMAL)
            startedAt {
              year
              month
              day
            }
            completedAt {
              year
              month
              day
            }
            media {
              id
              title {
                romaji
                english
                native
                userPreferred
              }
              coverImage {
                large
              }
              bannerImage
              episodes
              format
              status
              season
              seasonYear
              averageScore
              meanScore
              popularity
              favourites
              duration
              source
              countryOfOrigin
              startDate {
                year
                month
                day
              }
              endDate {
                year
                month
                day
              }
              trailer {
                id
                site
                thumbnail
              }
              siteUrl
              description
              genres
              synonyms
              nextAiringEpisode {
                episode
                airingAt
              }
              studios {
                nodes {
                  name
                }
              }
            }
          }
        }
      }
    }
  `;

  const data = await anilistRequest(query, { userName });

  if (!data?.data?.MediaListCollection) {
    throw new Error(USER_IMPORT_NOT_FOUND_MESSAGE);
  }

  return data.data.MediaListCollection;
}

async function getViewer(accessToken) {
  const query = `
    query {
      Viewer {
        id
        name
      }
    }
  `;

  const data = await anilistRequest(query, {}, accessToken);
  return data.data.Viewer;
}

async function getViewerAnimeCollection(accessToken, userId) {
  const query = `
    query ($userId: Int) {
      MediaListCollection(
        userId: $userId
        type: ANIME
        forceSingleCompletedList: true
      ) {
        lists {
          name
          status
          entries {
            status
            progress
            repeat
            notes
            score(format: POINT_10_DECIMAL)
            startedAt {
              year
              month
              day
            }
            completedAt {
              year
              month
              day
            }
            media {
              id
              title {
                romaji
                english
                native
                userPreferred
              }
              coverImage {
                large
              }
              bannerImage
              episodes
              format
              status
              season
              seasonYear
              averageScore
              meanScore
              popularity
              favourites
              duration
              source
              countryOfOrigin
              startDate {
                year
                month
                day
              }
              endDate {
                year
                month
                day
              }
              trailer {
                id
                site
                thumbnail
              }
              siteUrl
              description
              genres
              synonyms
              nextAiringEpisode {
                episode
                airingAt
              }
              studios {
                nodes {
                  name
                }
              }
            }
          }
        }
      }
    }
  `;

  const data = await anilistRequest(query, { userId }, accessToken);

  if (!data?.data?.MediaListCollection) {
    throw new Error(USER_IMPORT_NOT_FOUND_MESSAGE);
  }

  return data.data.MediaListCollection;
}

function mapDateInput(value) {
  if (!value) return null;

  if (
    typeof value === 'object' &&
    Number.isFinite(value.year) &&
    Number.isFinite(value.month) &&
    Number.isFinite(value.day)
  ) {
    return value;
  }

  const [year, month, day] = String(value).split('-').map(Number);

  if (!year || !month || !day) {
    return null;
  }

  return { year, month, day };
}

function compactVariables(variables) {
  return Object.fromEntries(
    Object.entries(variables).filter(([, value]) => value !== null && value !== undefined)
  );
}

async function saveMediaListEntry(accessToken, payload) {
  const query = `
    mutation (
      $mediaId: Int,
      $status: MediaListStatus,
      $progress: Int,
      $score: Float,
      $notes: String,
      $startedAt: FuzzyDateInput,
      $completedAt: FuzzyDateInput,
      $repeat: Int
    ) {
      SaveMediaListEntry(
        mediaId: $mediaId,
        status: $status,
        progress: $progress,
        score: $score,
        notes: $notes,
        startedAt: $startedAt,
        completedAt: $completedAt,
        repeat: $repeat
      ) {
        id
        updatedAt
      }
    }
  `;

  const data = await anilistRequest(
    query,
    compactVariables({
      mediaId: payload.mediaId,
      status: payload.status,
      progress: payload.progress,
      score: payload.score,
      notes: payload.notes,
      startedAt: mapDateInput(payload.startedAt),
      completedAt: mapDateInput(payload.completedAt),
      repeat: payload.repeat,
    }),
    accessToken
  );

  return data.data.SaveMediaListEntry;
}

module.exports = {
  searchAnime,
  getTrendingAnime,
  getDiscoverAnime,
  getDiscoverShelfAnime,
  getUserAnimeCollection,
  getViewer,
  getViewerAnimeCollection,
  saveMediaListEntry,
};
