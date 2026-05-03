const http = require('http');
const crypto = require('crypto');

const anilist = require('./anilist');
const {
  dbPath,
  saveAnime,
  saveAnimeSummary,
  getAppSetting,
  setAppSetting,
  getSafeUserById,
  getUserByNormalizedUsername,
  getAniListAccountByUserId,
  updateAniListAccountImportTime,
  updateTutorialDismissed,
  insertSyncHistory,
} = require('./db');
const { mapAnimeForDb } = require('./animeMapper');
const {
  registerUser,
  loginUser,
  logoutUser,
} = require('./auth');
const {
  getMyAnimeList,
  getMyAnimeEntry,
  saveMyAnimeEntry,
  removeMyAnimeEntry,
  clearMyAnimeList,
  importAniListEntries,
} = require('./lists');
const {
  runSyncForUser,
  getSyncStatus,
  getSyncActivity,
  setAutoSyncEnabled,
} = require('./sync');

const PORT = Number(process.env.PORT || 3000);
const DEFAULT_WEB_ORIGIN = 'https://web.seenary.app';
const ALLOWED_ORIGINS = new Set(
  (process.env.WEB_ORIGINS || process.env.WEB_ORIGIN || DEFAULT_WEB_ORIGIN)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);

ALLOWED_ORIGINS.add('http://localhost:5173');
ALLOWED_ORIGINS.add('http://127.0.0.1:5173');

const sessions = new Map();
const SESSION_COOKIE = 'seenary_sid';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const DEFAULT_APP_SETTINGS = {
  themeAccent: 'cyan',
  titleLanguage: 'userPreferred',
  showTrendingCarousel: true,
  autoRotateTrending: true,
  autoScrollHomeShelves: true,
  hideAdultContent: true,
};

const ALLOWED_THEME_ACCENTS = ['cyan', 'violet', 'rose', 'amber', 'emerald'];
const ALLOWED_TITLE_LANGUAGES = ['userPreferred', 'english', 'romaji', 'native'];
const IMPORT_STATUS_ORDER = ['watching', 'planned', 'completed', 'paused', 'dropped'];

function getAllowedOrigin(req) {
  const origin = req.headers.origin;
  return origin && ALLOWED_ORIGINS.has(origin) ? origin : DEFAULT_WEB_ORIGIN;
}

function setCorsHeaders(req, res) {
  res.setHeader('Access-Control-Allow-Origin', getAllowedOrigin(req));
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Vary', 'Origin');
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return Object.fromEntries(
    header
      .split(';')
      .map((cookie) => cookie.trim())
      .filter(Boolean)
      .map((cookie) => {
        const index = cookie.indexOf('=');
        return index === -1
          ? [cookie, '']
          : [cookie.slice(0, index), decodeURIComponent(cookie.slice(index + 1))];
      })
  );
}

function buildCookie(name, value, options = {}) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${options.maxAge ?? SESSION_MAX_AGE_SECONDS}`,
    'SameSite=Lax',
  ];

  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }

  return parts.join('; ');
}

function createWebSession(res, userId) {
  const sessionId = crypto.randomBytes(32).toString('hex');
  sessions.set(sessionId, {
    userId: Number(userId),
    createdAt: Date.now(),
  });
  res.setHeader('Set-Cookie', buildCookie(SESSION_COOKIE, sessionId));
}

function clearWebSession(req, res) {
  const sessionId = parseCookies(req)[SESSION_COOKIE];
  if (sessionId) {
    sessions.delete(sessionId);
  }
  res.setHeader('Set-Cookie', buildCookie(SESSION_COOKIE, '', { maxAge: 0 }));
}

function getCurrentSession(req) {
  const sessionId = parseCookies(req)[SESSION_COOKIE];
  const session = sessionId ? sessions.get(sessionId) : null;

  if (!session?.userId) {
    return { authenticated: false, user: null };
  }

  const user = getSafeUserById(session.userId);

  if (!user) {
    sessions.delete(sessionId);
    return { authenticated: false, user: null };
  }

  return { authenticated: true, user };
}

function sendJson(req, res, status, payload) {
  setCorsHeaders(req, res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        req.destroy();
        reject(new Error('Request body is too large.'));
      }
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON body.'));
      }
    });
    req.on('error', reject);
  });
}

function getAppPreferences() {
  const themeAccent = getAppSetting('preferences.themeAccent');
  const titleLanguage = getAppSetting('preferences.titleLanguage');
  const showTrendingCarousel = getAppSetting('preferences.showTrendingCarousel');
  const autoRotateTrending = getAppSetting('preferences.autoRotateTrending');
  const autoScrollHomeShelves = getAppSetting('preferences.autoScrollHomeShelves');
  const hideAdultContent = getAppSetting('preferences.hideAdultContent');

  return {
    themeAccent: ALLOWED_THEME_ACCENTS.includes(themeAccent)
      ? themeAccent
      : DEFAULT_APP_SETTINGS.themeAccent,
    titleLanguage: ALLOWED_TITLE_LANGUAGES.includes(titleLanguage)
      ? titleLanguage
      : DEFAULT_APP_SETTINGS.titleLanguage,
    showTrendingCarousel:
      showTrendingCarousel === null
        ? DEFAULT_APP_SETTINGS.showTrendingCarousel
        : showTrendingCarousel === 'true',
    autoRotateTrending:
      autoRotateTrending === null
        ? DEFAULT_APP_SETTINGS.autoRotateTrending
        : autoRotateTrending === 'true',
    autoScrollHomeShelves:
      autoScrollHomeShelves === null
        ? DEFAULT_APP_SETTINGS.autoScrollHomeShelves
        : autoScrollHomeShelves === 'true',
    hideAdultContent:
      hideAdultContent === null
        ? DEFAULT_APP_SETTINGS.hideAdultContent
        : hideAdultContent === 'true',
  };
}

function updateAppPreferences(payload = {}) {
  const current = getAppPreferences();
  const next = {
    themeAccent: ALLOWED_THEME_ACCENTS.includes(payload.themeAccent)
      ? payload.themeAccent
      : current.themeAccent,
    titleLanguage: ALLOWED_TITLE_LANGUAGES.includes(payload.titleLanguage)
      ? payload.titleLanguage
      : current.titleLanguage,
    showTrendingCarousel:
      typeof payload.showTrendingCarousel === 'boolean'
        ? payload.showTrendingCarousel
        : current.showTrendingCarousel,
    autoRotateTrending:
      typeof payload.autoRotateTrending === 'boolean'
        ? payload.autoRotateTrending
        : current.autoRotateTrending,
    autoScrollHomeShelves:
      typeof payload.autoScrollHomeShelves === 'boolean'
        ? payload.autoScrollHomeShelves
        : current.autoScrollHomeShelves,
    hideAdultContent:
      typeof payload.hideAdultContent === 'boolean'
        ? payload.hideAdultContent
        : current.hideAdultContent,
  };

  setAppSetting('preferences.themeAccent', next.themeAccent);
  setAppSetting('preferences.titleLanguage', next.titleLanguage);
  setAppSetting('preferences.showTrendingCarousel', next.showTrendingCarousel);
  setAppSetting('preferences.autoRotateTrending', next.autoRotateTrending);
  setAppSetting('preferences.autoScrollHomeShelves', next.autoScrollHomeShelves);
  setAppSetting('preferences.hideAdultContent', next.hideAdultContent);

  return next;
}

function buildMinimalAnimeForDb(media) {
  return mapAnimeForDb({
    id: media.id,
    title: {
      romaji: media.title?.romaji ?? null,
      english: media.title?.english ?? null,
      native: null,
      userPreferred:
        media.title?.userPreferred ?? media.title?.english ?? media.title?.romaji ?? null,
    },
    coverImage: { large: media.coverImage?.large ?? null },
    bannerImage: null,
    episodes: media.episodes ?? null,
    format: media.format ?? null,
    status: null,
    season: media.season ?? null,
    seasonYear: media.seasonYear ?? null,
    averageScore: media.averageScore ?? null,
    meanScore: null,
    popularity: null,
    favourites: null,
    duration: null,
    source: null,
    countryOfOrigin: null,
    startDate: null,
    endDate: null,
    trailer: null,
    siteUrl: null,
    description: null,
    genres: [],
    synonyms: [],
    nextAiringEpisode: null,
    studios: { nodes: [] },
    tags: [],
    staff: { edges: [] },
    characters: { edges: [] },
    relations: { edges: [] },
    recommendations: { nodes: [] },
    externalLinks: [],
    streamingEpisodes: [],
  });
}

function sanitizeImportStatus(status) {
  const value = String(status || '').trim().toUpperCase();

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

function buildAniListImportPreview(collection) {
  const lists = Array.isArray(collection?.lists) ? collection.lists : [];
  const grouped = {
    watching: [],
    planned: [],
    completed: [],
    paused: [],
    dropped: [],
  };

  for (const list of lists) {
    for (const entry of list?.entries || []) {
      const media = entry?.media;
      const status = sanitizeImportStatus(entry?.status);

      if (!media?.id || !status || !grouped[status]) {
        continue;
      }

      grouped[status].push({
        animeId: media.id,
        status,
        progress: entry.progress ?? 0,
        score: entry.score ?? null,
        notes: entry.notes ?? null,
        title: {
          romaji: media.title?.romaji ?? null,
          english: media.title?.english ?? null,
          native: media.title?.native ?? null,
          userPreferred: media.title?.userPreferred ?? null,
        },
        coverImage: { large: media.coverImage?.large ?? null },
        episodes: media.episodes ?? null,
        format: media.format ?? null,
        season: media.season ?? null,
        seasonYear: media.seasonYear ?? null,
      });
    }
  }

  return {
    totalFound: Object.values(grouped).reduce((sum, items) => sum + items.length, 0),
    groups: IMPORT_STATUS_ORDER.map((status) => ({
      status,
      items: grouped[status],
    })),
  };
}

async function importAuthenticatedAniListList(accessToken, viewer, currentSession) {
  const collection = await anilist.getViewerAnimeCollection(accessToken, viewer.id);
  const result = importAniListEntries(currentSession, collection, viewer.name, {
    selectedStatuses: IMPORT_STATUS_ORDER,
    selectedAnimeIds: [],
  });

  if (result.ok) {
    updateAniListAccountImportTime(viewer.id);
  }

  return result;
}

async function fetchAnimeDetailsFromAniList(id) {
  const media = await anilist.getAnimeDetails
    ? await anilist.getAnimeDetails(id)
    : await fetchAnimeDetailsFallback(id);
  saveAnime(mapAnimeForDb(media));
  return media;
}

async function fetchAnimeDetailsFallback(id) {
  const fetch = require('node-fetch');
  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        id
        title { romaji english native userPreferred }
        coverImage { large }
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
        startDate { year month day }
        endDate { year month day }
        trailer { id site thumbnail }
        siteUrl
        description
        genres
        synonyms
        nextAiringEpisode { episode airingAt }
        studios { nodes { name } }
        tags { id name description rank isMediaSpoiler isGeneralSpoiler }
        characters(perPage: 20) {
          edges {
            role
            node { id name { full native userPreferred } image { large } }
            voiceActors(language: JAPANESE) {
              id
              name { full native userPreferred }
              language
              image { large }
            }
          }
        }
        staff(perPage: 20) {
          edges {
            role
            node { id name { full native userPreferred } image { large } }
          }
        }
        relations {
          edges {
            relationType
            node {
              id
              title { romaji english native userPreferred }
              coverImage { large }
              episodes
              format
              status
              season
              seasonYear
              averageScore
            }
          }
        }
        recommendations(perPage: 10) {
          nodes {
            rating
            mediaRecommendation {
              id
              title { romaji english native userPreferred }
              coverImage { large }
              description
              episodes
              format
              status
              season
              seasonYear
              averageScore
            }
          }
        }
        externalLinks {
          id
          url
          site
          siteId
          type
          language
          color
          icon
          notes
          isDisabled
        }
        streamingEpisodes { title thumbnail url site }
      }
    }
  `;

  const response = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ query, variables: { id } }),
  });
  const data = await response.json();

  if (!response.ok || data.errors) {
    throw new Error(data.errors?.[0]?.message || `AniList request failed with status ${response.status}`);
  }

  return data.data.Media;
}

async function handleRpc(method, args, req, res) {
  const currentSession = getCurrentSession(req);

  switch (method) {
    case 'searchAnime':
      return await anilist.searchAnime(args[0], { hideAdultContent: args[1] });
    case 'getTrendingAnime':
      return await anilist.getTrendingAnime({ hideAdultContent: args[0] });
    case 'getDiscoverAnime':
      return await anilist.getDiscoverAnime({ hideAdultContent: args[0] });
    case 'getDiscoverShelfAnime':
      return await anilist.getDiscoverShelfAnime({
        shelfId: args[0],
        page: args[1],
        hideAdultContent: args[2],
      });
    case 'previewAniListImport': {
      const username = String(args[0] || '').trim();
      if (!username) return { ok: false, message: 'Enter an AniList username first.' };
      const collection = await anilist.getUserAnimeCollection(username);
      const preview = buildAniListImportPreview(collection);
      return preview.totalFound
        ? { ok: true, username, preview }
        : { ok: false, message: `No anime list data was found for ${username}.` };
    }
    case 'importAniList': {
      const username = String(args[0] || '').trim();
      if (!username) return { ok: false, message: 'Enter an AniList username first.' };
      const collection = await anilist.getUserAnimeCollection(username);
      return importAniListEntries(currentSession, collection, username, {
        selectedStatuses: args[1],
        selectedAnimeIds: args[2],
      });
    }
    case 'getSettings':
      return getAppPreferences();
    case 'updateSettings':
      return updateAppPreferences(args[0]);
    case 'getSyncStatus':
      return currentSession.authenticated
        ? getSyncStatus(currentSession.user.id)
        : { ok: false, message: 'You must be logged in.' };
    case 'setAutoSync':
      if (!currentSession.authenticated) return { ok: false, message: 'You must be logged in.' };
      setAutoSyncEnabled(currentSession.user.id, Boolean(args[0]));
      return getSyncStatus(currentSession.user.id);
    case 'runSyncNow':
      return currentSession.authenticated
        ? await runSyncForUser(currentSession.user.id)
        : { ok: false, message: 'You must be logged in.' };
    case 'pullFromAniList': {
      if (!currentSession.authenticated) return { ok: false, message: 'You must be logged in.' };
      const linkedAccount = getAniListAccountByUserId(currentSession.user.id);
      if (!linkedAccount?.access_token || !linkedAccount?.anilist_user_id) {
        return { ok: false, message: 'Link an AniList account before updating from AniList.' };
      }
      const collection = await anilist.getViewerAnimeCollection(
        linkedAccount.access_token,
        linkedAccount.anilist_user_id
      );
      const result = importAniListEntries(currentSession, collection, linkedAccount.anilist_username, {
        selectedStatuses: IMPORT_STATUS_ORDER,
        selectedAnimeIds: [],
      });

      if (result.ok) {
        updateAniListAccountImportTime(linkedAccount.anilist_user_id);
        for (const change of result.summary?.changes || []) {
          insertSyncHistory({
            userId: currentSession.user.id,
            animeId: change.animeId,
            animeTitle: change.animeTitle,
            operation: 'pull_from_anilist',
            changedFields: change.changedFields,
            status: 'completed',
            message: 'Updated local entry from AniList.',
          });
        }
      }

      return result;
    }
    case 'getSyncActivity':
      return currentSession.authenticated
        ? getSyncActivity(currentSession.user.id)
        : { ok: false, message: 'You must be logged in.' };
    case 'getAnimeDetails':
      return await fetchAnimeDetailsFromAniList(args[0]);
    case 'cacheMinimalAnime':
      if (!args[0]?.id) return { ok: false, message: 'Invalid anime data.' };
      saveAnimeSummary(buildMinimalAnimeForDb(args[0]));
      return { ok: true };
    case 'register': {
      const result = await registerUser(args[0], args[1]);
      if (result.ok && result.user?.id) createWebSession(res, result.user.id);
      return result;
    }
    case 'login': {
      const result = await loginUser(args[0], args[1]);
      if (result.ok && result.user?.id) createWebSession(res, result.user.id);
      return result;
    }
    case 'logout':
      clearWebSession(req, res);
      logoutUser();
      return { ok: true, message: 'Logged out successfully.' };
    case 'getSession':
      return currentSession;
    case 'setTutorialDismissed':
      if (!currentSession.authenticated) return { ok: false, message: 'You must be logged in.', user: null };
      updateTutorialDismissed(currentSession.user.id, Boolean(args[0]));
      return { ok: true, message: 'Tutorial preference updated.', user: getSafeUserById(currentSession.user.id) };
    case 'getMyList':
      return getMyAnimeList(currentSession);
    case 'getMyListEntry':
      return getMyAnimeEntry(currentSession, args[0]);
    case 'saveMyListEntry':
      return saveMyAnimeEntry(currentSession, args[0], args[1]);
    case 'removeMyListEntry':
      return removeMyAnimeEntry(currentSession, args[0]);
    case 'clearMyList':
      return clearMyAnimeList(currentSession);
    case 'startAniListLogin':
    case 'completeAniListLogin':
    case 'linkAniListAccount':
    case 'resolveAniListLinkConflict':
      return {
        ok: false,
        linked: false,
        message: 'AniList OAuth linking is not available in the hosted web build yet.',
      };
    case 'getAniListLinkStatus': {
      if (!currentSession.authenticated) {
        return { ok: false, message: 'You must be logged in.', linked: false };
      }

      const linkedAccount = getAniListAccountByUserId(currentSession.user.id);

      return {
        ok: true,
        linked: Boolean(linkedAccount),
        account: linkedAccount
          ? {
              anilistUserId: linkedAccount.anilist_user_id,
              anilistUsername: linkedAccount.anilist_username,
              originalAniListUsername: linkedAccount.original_anilist_username,
              lastImportAt: linkedAccount.last_import_at,
              updatedAt: linkedAccount.updated_at,
            }
          : null,
      };
    }
    default:
      return { ok: false, message: `Unknown API method: ${method}` };
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    setCorsHeaders(req, res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    sendJson(req, res, 200, {
      ok: true,
      ...(process.env.SHOW_DB_PATH === 'true' ? { dbPath } : {}),
    });
    return;
  }

  if (req.method !== 'POST' || req.url !== '/rpc') {
    sendJson(req, res, 404, { ok: false, message: 'Not found.' });
    return;
  }

  try {
    const body = await readJson(req);
    const result = await handleRpc(body.method, Array.isArray(body.args) ? body.args : [], req, res);
    sendJson(req, res, 200, result);
  } catch (error) {
    console.error('API error:', error);
    sendJson(req, res, 500, {
      ok: false,
      message: error.message || 'Internal server error.',
    });
  }
});

server.listen(PORT, () => {
  console.log(`Seenary API listening on port ${PORT}`);
});
