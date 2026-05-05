const http = require('http');
const crypto = require('crypto');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const anilist = require('./anilist');
const {
  dbPath,
  saveAnime,
  saveAnimeSummary,
  getAppSetting,
  setAppSetting,
  getSafeUserById,
  getUserByNormalizedUsername,
  getAniListAccountByAniListUserId,
  getAniListAccountByUserId,
  deleteAniListAccountByUserId,
  mergeUserIntoUser,
  upsertAniListAccount,
  updateAniListAccountImportTime,
  updateTutorialDismissed,
  insertSyncHistory,
  createWebSessionRecord,
  getWebSessionByHash,
  updateWebSessionExpiry,
  deleteWebSession,
  deleteExpiredWebSessions,
} = require('./db');
const { mapAnimeForDb } = require('./animeMapper');
const {
  registerUser,
  loginUser,
  createLinkedUser,
  loginUserById,
  logoutUser,
  normalizeUsername,
  validateUsername,
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

const SESSION_COOKIE = 'seenary_sid';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_SECONDS * 1000;
const ANILIST_CLIENT_ID = process.env.ANILIST_CLIENT_ID || '40156';
const ANILIST_CLIENT_SECRET =
  process.env.ANILIST_CLIENT_SECRET || 'V7N4za6ypyjv3k35wSboybL1WY2q6raJwx83oWns';
const ANILIST_AUTHORIZE_URL = 'https://anilist.co/api/v2/oauth/authorize';
const ANILIST_TOKEN_URL = 'https://anilist.co/api/v2/oauth/token';
const DEFAULT_API_ORIGIN =
  process.env.NODE_ENV === 'production' ? 'https://api.seenary.app' : `http://localhost:${PORT}`;
const API_PUBLIC_ORIGIN = process.env.API_PUBLIC_ORIGIN || DEFAULT_API_ORIGIN;
const ANILIST_REDIRECT_URI =
  process.env.ANILIST_REDIRECT_URI || `${API_PUBLIC_ORIGIN}/auth/anilist/callback`;
const ANILIST_FLOW_TIMEOUT_MS = 10 * 60 * 1000;
const DESKTOP_UPDATES_DIR =
  process.env.DESKTOP_UPDATES_DIR || path.join(path.dirname(dbPath), 'desktop-updates');

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
const pendingAniListFlows = new Map();
const pendingAniListSignupByFlowId = new Map();
const pendingAniListLinkConflictByUserId = new Map();

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

function hashSessionToken(sessionToken) {
  return crypto.createHash('sha256').update(sessionToken).digest('hex');
}

function getWebOrigin(req) {
  return getAllowedOrigin(req);
}

function cleanupAniListFlows(now = Date.now()) {
  for (const [flowId, flow] of pendingAniListFlows) {
    if (now - flow.createdAt > ANILIST_FLOW_TIMEOUT_MS) {
      pendingAniListFlows.delete(flowId);
    }
  }

  for (const [flowId, signup] of pendingAniListSignupByFlowId) {
    if (now - signup.createdAt > ANILIST_FLOW_TIMEOUT_MS) {
      pendingAniListSignupByFlowId.delete(flowId);
    }
  }

  for (const [userId, conflict] of pendingAniListLinkConflictByUserId) {
    if (now - conflict.createdAt > ANILIST_FLOW_TIMEOUT_MS) {
      pendingAniListLinkConflictByUserId.delete(userId);
    }
  }
}

function createAniListFlow({ type, userId = null, returnTo }) {
  cleanupAniListFlows();

  const flowId = crypto.randomBytes(16).toString('hex');
  const state = crypto.randomBytes(24).toString('hex');
  const flow = {
    id: flowId,
    state,
    type,
    userId: userId == null ? null : Number(userId),
    returnTo,
    status: 'pending',
    createdAt: Date.now(),
    result: null,
    error: null,
  };

  pendingAniListFlows.set(flowId, flow);

  const url = new URL(ANILIST_AUTHORIZE_URL);
  url.searchParams.set('client_id', ANILIST_CLIENT_ID);
  url.searchParams.set('redirect_uri', ANILIST_REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', `${flowId}.${state}`);

  return { flow, authUrl: url.toString() };
}

function sendAniListCallbackPage(res, title, body, returnTo) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            background: #10141f;
            color: #eef6ff;
            font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          }
          main {
            max-width: 420px;
            padding: 32px;
            text-align: center;
          }
          h1 {
            margin: 0 0 12px;
            font-size: 28px;
          }
          p {
            margin: 0;
            color: rgba(238, 246, 255, 0.72);
            line-height: 1.55;
          }
        </style>
      </head>
      <body>
        <main>
          <h1>${title}</h1>
          <p>${body}</p>
        </main>
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: 'seenary:anilist-oauth-complete' }, ${JSON.stringify(returnTo)});
            window.setTimeout(() => window.close(), 700);
          }
        </script>
      </body>
    </html>
  `);
}

async function exchangeAniListCodeForToken(code) {
  const response = await fetch(ANILIST_TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: ANILIST_CLIENT_ID,
      client_secret: ANILIST_CLIENT_SECRET,
      redirect_uri: ANILIST_REDIRECT_URI,
      code,
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.access_token) {
    throw new Error(data?.message || 'Failed to exchange AniList authorization code.');
  }

  return data.access_token;
}

function buildAniListAccountPayload(account) {
  return {
    anilistUserId: account.anilist_user_id,
    anilistUsername: account.anilist_username,
    originalAniListUsername: account.original_anilist_username,
    lastImportAt: account.last_import_at,
    updatedAt: account.updated_at,
  };
}

function createWebSession(res, userId) {
  const sessionToken = crypto.randomBytes(32).toString('hex');
  createWebSessionRecord({
    sessionHash: hashSessionToken(sessionToken),
    userId: Number(userId),
    expiresAt: Date.now() + SESSION_MAX_AGE_MS,
  });
  res.setHeader('Set-Cookie', buildCookie(SESSION_COOKIE, sessionToken));
}

function clearWebSession(req, res) {
  const sessionToken = parseCookies(req)[SESSION_COOKIE];
  if (sessionToken) {
    deleteWebSession(hashSessionToken(sessionToken));
  }
  res.setHeader('Set-Cookie', buildCookie(SESSION_COOKIE, '', { maxAge: 0 }));
}

function getCurrentSession(req, res, options = {}) {
  const shouldRefresh = options.refresh !== false;
  const sessionToken = parseCookies(req)[SESSION_COOKIE];
  const sessionHash = sessionToken ? hashSessionToken(sessionToken) : null;
  const session = sessionHash ? getWebSessionByHash(sessionHash) : null;

  if (!session?.user_id) {
    return { authenticated: false, user: null };
  }

  if (Number(session.expires_at) <= Date.now()) {
    deleteWebSession(sessionHash);
    if (res) {
      res.setHeader('Set-Cookie', buildCookie(SESSION_COOKIE, '', { maxAge: 0 }));
    }
    return { authenticated: false, user: null };
  }

  const user = getSafeUserById(session.user_id);

  if (!user) {
    deleteWebSession(sessionHash);
    if (res) {
      res.setHeader('Set-Cookie', buildCookie(SESSION_COOKIE, '', { maxAge: 0 }));
    }
    return { authenticated: false, user: null };
  }

  const expiresAt = shouldRefresh ? Date.now() + SESSION_MAX_AGE_MS : Number(session.expires_at);

  if (shouldRefresh) {
    updateWebSessionExpiry(sessionHash, expiresAt);
  }

  if (res && shouldRefresh) {
    res.setHeader('Set-Cookie', buildCookie(SESSION_COOKIE, sessionToken));
  }

  return { authenticated: true, user, expiresAt };
}

function sendJson(req, res, status, payload) {
  setCorsHeaders(req, res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function getContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  switch (extension) {
    case '.yml':
    case '.yaml':
      return 'text/yaml; charset=utf-8';
    case '.exe':
      return 'application/vnd.microsoft.portable-executable';
    case '.blockmap':
      return 'application/octet-stream';
    default:
      return 'application/octet-stream';
  }
}

function getDesktopUpdatesDebugInfo() {
  const updatesRoot = path.resolve(DESKTOP_UPDATES_DIR);
  let rootStats = null;
  let files = [];
  let error = null;

  try {
    rootStats = fs.statSync(updatesRoot);

    if (rootStats.isDirectory()) {
      files = fs.readdirSync(updatesRoot, { withFileTypes: true }).map((entry) => {
        const entryPath = path.join(updatesRoot, entry.name);
        const stats = fs.statSync(entryPath);

        return {
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
          size: entry.isFile() ? stats.size : null,
          modifiedAt: stats.mtime.toISOString(),
        };
      });
    }
  } catch (debugError) {
    error = debugError.message;
  }

  return {
    cwd: process.cwd(),
    serverDir: __dirname,
    dbPath,
    desktopUpdatesDir: DESKTOP_UPDATES_DIR,
    resolvedDesktopUpdatesDir: updatesRoot,
    desktopUpdatesDirExists: Boolean(rootStats),
    desktopUpdatesDirIsDirectory: Boolean(rootStats?.isDirectory()),
    files,
    error,
  };
}

function sendDesktopUpdatesDebug(req, res) {
  const debugToken = process.env.DESKTOP_UPDATES_DEBUG_TOKEN;

  if (!debugToken) {
    sendJson(req, res, 404, { ok: false, message: 'Not found.' });
    return;
  }

  const requestUrl = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);

  if (requestUrl.searchParams.get('token') !== debugToken) {
    sendJson(req, res, 403, { ok: false, message: 'Forbidden.' });
    return;
  }

  sendJson(req, res, 200, {
    ok: true,
    ...getDesktopUpdatesDebugInfo(),
  });
}

function sendDesktopUpdateFile(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);
  const relativePath = decodeURIComponent(
    requestUrl.pathname.replace(/^\/desktop-updates\/?/, '')
  );

  if (!relativePath) {
    sendJson(req, res, 404, { ok: false, message: 'Update file not found.' });
    return;
  }

  const updatesRoot = path.resolve(DESKTOP_UPDATES_DIR);
  const filePath = path.resolve(updatesRoot, relativePath);

  if (!filePath.startsWith(`${updatesRoot}${path.sep}`)) {
    sendJson(req, res, 403, { ok: false, message: 'Invalid update file path.' });
    return;
  }

  fs.stat(filePath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      sendJson(req, res, 404, { ok: false, message: 'Update file not found.' });
      return;
    }

    res.writeHead(200, {
      'Content-Type': getContentType(filePath),
      'Content-Length': stats.size,
      'Cache-Control': relativePath === 'latest.yml' ? 'no-cache' : 'public, max-age=31536000',
    });
    fs.createReadStream(filePath).pipe(res);
  });
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

async function finishAniListLogin({ accessToken, viewer, userId, res }) {
  deleteAniListAccountByUserId(userId);

  upsertAniListAccount({
    userId,
    anilistUserId: viewer.id,
    anilistUsername: viewer.name,
    originalAniListUsername: viewer.name,
    accessToken,
  });

  const loginResult = loginUserById(userId);

  if (!loginResult.ok) {
    return loginResult;
  }

  if (res) {
    createWebSession(res, userId);
  }

  let importResult;

  try {
    importResult = await importAuthenticatedAniListList(accessToken, viewer, {
      authenticated: true,
      user: loginResult.user,
    });
  } catch (error) {
    console.error('AniList authenticated import error:', error);
    importResult = {
      ok: false,
      message: error.message || 'Failed to import AniList list.',
    };
  }

  return {
    ok: true,
    message: importResult.ok
      ? 'Logged in with AniList and imported your list.'
      : 'Logged in with AniList, but list import failed.',
    user: loginResult.user,
    import: importResult,
  };
}

async function linkAniListToUser({ accessToken, viewer, userId }) {
  deleteAniListAccountByUserId(userId);
  upsertAniListAccount({
    userId,
    anilistUserId: viewer.id,
    anilistUsername: viewer.name,
    originalAniListUsername: viewer.name,
    accessToken,
  });

  const user = getSafeUserById(userId);
  const importResult = await importAuthenticatedAniListList(accessToken, viewer, {
    authenticated: Boolean(user),
    user,
  }).catch((error) => {
    console.error('AniList link import error:', error);
    return {
      ok: false,
      message: error.message || 'Failed to import AniList list.',
    };
  });

  const account = getAniListAccountByUserId(userId);

  return {
    ok: true,
    linked: true,
    message: importResult.ok
      ? `Linked AniList account ${viewer.name} and imported your list.`
      : `Linked AniList account ${viewer.name}, but list import failed.`,
    account: account
      ? buildAniListAccountPayload(account)
      : {
          anilistUserId: viewer.id,
          anilistUsername: viewer.name,
          originalAniListUsername: viewer.name,
          lastImportAt: importResult.ok ? new Date().toISOString() : null,
          updatedAt: new Date().toISOString(),
        },
    import: importResult,
  };
}

async function handleAniListLoginCallback(flow, accessToken, viewer) {
  if (!viewer?.id || !viewer?.name) {
    return { ok: false, message: 'AniList did not return account details.' };
  }

  const linkedAccount = getAniListAccountByAniListUserId(viewer.id);

  if (linkedAccount?.user_id) {
    pendingAniListSignupByFlowId.delete(flow.id);
    return await finishAniListLogin({
      accessToken,
      viewer,
      userId: linkedAccount.user_id,
    });
  }

  pendingAniListSignupByFlowId.set(flow.id, {
    accessToken,
    viewer,
    createdAt: Date.now(),
  });

  return {
    ok: true,
    needsProfile: true,
    message: 'AniList account verified. Choose your local display name.',
    anilist: {
      id: viewer.id,
      username: viewer.name,
    },
    suggestedUsername: viewer.name,
  };
}

async function handleAniListLinkCallback(flow, accessToken, viewer) {
  if (!flow.userId) {
    return { ok: false, linked: false, message: 'AniList link session expired. Try linking again.' };
  }

  const sessionUser = getSafeUserById(flow.userId);

  if (!sessionUser) {
    return { ok: false, linked: false, message: 'You must be logged in.', };
  }

  if (!viewer?.id || !viewer?.name) {
    return { ok: false, linked: false, message: 'AniList did not return account details.' };
  }

  const existingLinkedAccount = getAniListAccountByAniListUserId(viewer.id);

  if (
    existingLinkedAccount?.user_id &&
    Number(existingLinkedAccount.user_id) !== Number(flow.userId)
  ) {
    const existingUser = getSafeUserById(existingLinkedAccount.user_id);

    pendingAniListLinkConflictByUserId.set(Number(flow.userId), {
      accessToken,
      viewer,
      sourceUserId: Number(existingLinkedAccount.user_id),
      targetUserId: Number(flow.userId),
      createdAt: Date.now(),
    });

    return {
      ok: true,
      message: `AniList account ${viewer.name} is already linked to another local account.`,
      linked: false,
      needsConflictResolution: true,
      conflict: {
        anilistUserId: viewer.id,
        anilistUsername: viewer.name,
        sourceUser: existingUser
          ? {
              id: existingUser.id,
              username: existingUser.username,
            }
          : null,
        targetUser: {
          id: sessionUser.id,
          username: sessionUser.username,
        },
      },
    };
  }

  pendingAniListLinkConflictByUserId.delete(Number(flow.userId));

  return await linkAniListToUser({
    accessToken,
    viewer,
    userId: flow.userId,
  });
}

async function fetchAnimeDetailsFromAniList(id) {
  const media = await anilist.getAnimeDetails
    ? await anilist.getAnimeDetails(id)
    : await fetchAnimeDetailsFallback(id);
  saveAnime(mapAnimeForDb(media));
  return media;
}

async function fetchAnimeDetailsFallback(id) {
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
  const currentSession = getCurrentSession(req, res, {
    refresh: method !== 'getSession',
  });

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
    case 'startAniListLogin': {
      const { flow, authUrl } = createAniListFlow({
        type: 'login',
        returnTo: getWebOrigin(req),
      });

      return {
        ok: true,
        pendingOAuth: true,
        flowId: flow.id,
        authUrl,
        message: 'Open AniList to continue.',
      };
    }
    case 'pollAniListLogin': {
      cleanupAniListFlows();
      const flowId = String(args[0] || '');
      const flow = pendingAniListFlows.get(flowId);

      if (!flow) {
        return { ok: false, done: true, message: 'AniList login session expired. Try again.' };
      }

      if (flow.status === 'pending') {
        return { ok: true, done: false, message: 'Waiting for AniList authorization.' };
      }

      pendingAniListFlows.delete(flowId);

      if (flow.status === 'failed') {
        return { ok: false, done: true, message: flow.error || 'AniList login failed.' };
      }

      if (flow.result?.user?.id) {
        createWebSession(res, flow.result.user.id);
      }

      return { ...flow.result, done: true };
    }
    case 'completeAniListLogin': {
      cleanupAniListFlows();
      const username = String(args[0] || '').trim();
      const flowId = String(args[1] || '');
      const signup = pendingAniListSignupByFlowId.get(flowId);

      if (!signup) {
        return { ok: false, message: 'AniList login session expired. Try again.' };
      }

      const usernameError = validateUsername(username);

      if (usernameError) {
        return { ok: false, message: usernameError };
      }

      const usernameNormalized = normalizeUsername(username);

      if (getUserByNormalizedUsername(usernameNormalized)) {
        return { ok: false, message: 'Username is already taken.' };
      }

      const created = await createLinkedUser(username);

      if (!created.ok || !created.user) {
        return created;
      }

      pendingAniListSignupByFlowId.delete(flowId);

      return await finishAniListLogin({
        accessToken: signup.accessToken,
        viewer: signup.viewer,
        userId: created.user.id,
        res,
      });
    }
    case 'linkAniListAccount': {
      if (!currentSession.authenticated || !currentSession.user?.id) {
        return { ok: false, message: 'You must be logged in.', linked: false };
      }

      const { flow, authUrl } = createAniListFlow({
        type: 'link',
        userId: currentSession.user.id,
        returnTo: getWebOrigin(req),
      });

      return {
        ok: true,
        pendingOAuth: true,
        flowId: flow.id,
        authUrl,
        linked: false,
        message: 'Open AniList to continue.',
      };
    }
    case 'pollAniListLink': {
      cleanupAniListFlows();

      if (!currentSession.authenticated || !currentSession.user?.id) {
        return { ok: false, done: true, message: 'You must be logged in.', linked: false };
      }

      const flowId = String(args[0] || '');
      const flow = pendingAniListFlows.get(flowId);

      if (!flow || Number(flow.userId) !== Number(currentSession.user.id)) {
        return { ok: false, done: true, message: 'AniList link session expired. Try linking again.', linked: false };
      }

      if (flow.status === 'pending') {
        return { ok: true, done: false, linked: false, message: 'Waiting for AniList authorization.' };
      }

      pendingAniListFlows.delete(flowId);

      if (flow.status === 'failed') {
        return { ok: false, done: true, linked: false, message: flow.error || 'AniList link failed.' };
      }

      return { ...flow.result, done: true };
    }
    case 'resolveAniListLinkConflict': {
      if (!currentSession.authenticated || !currentSession.user?.id) {
        return { ok: false, message: 'You must be logged in.', linked: false };
      }

      cleanupAniListFlows();

      const conflict = pendingAniListLinkConflictByUserId.get(Number(currentSession.user.id));

      if (!conflict) {
        return { ok: false, message: 'No AniList link conflict is waiting.', linked: false };
      }

      const action = String(args[0] || '').trim();

      if (!['transfer', 'merge'].includes(action)) {
        return { ok: false, message: 'Choose transfer or merge.', linked: false };
      }

      pendingAniListLinkConflictByUserId.delete(Number(currentSession.user.id));

      let mergeSummary = null;

      if (action === 'merge') {
        mergeSummary = mergeUserIntoUser(conflict.sourceUserId, conflict.targetUserId);
      }

      const result = await linkAniListToUser({
        accessToken: conflict.accessToken,
        viewer: conflict.viewer,
        userId: conflict.targetUserId,
      });

      return {
        ...result,
        message:
          action === 'merge'
            ? `${result.message} Merged ${mergeSummary?.movedEntries ?? 0} list entries from the old local account.`
            : result.message,
        resolution: action,
        mergeSummary,
      };
    }
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

async function handleAniListCallback(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);
  const stateValue = requestUrl.searchParams.get('state') || '';
  const code = requestUrl.searchParams.get('code');
  const error = requestUrl.searchParams.get('error');
  const [flowId, returnedState] = stateValue.split('.');
  const flow = flowId ? pendingAniListFlows.get(flowId) : null;
  const returnTo = flow?.returnTo || DEFAULT_WEB_ORIGIN;

  if (!flow || !returnedState || returnedState !== flow.state) {
    sendAniListCallbackPage(
      res,
      'AniList login failed',
      'The authorization response could not be verified. You can close this tab and try again.',
      returnTo
    );
    return;
  }

  if (error) {
    flow.status = 'failed';
    flow.error = 'AniList authorization was cancelled.';
    sendAniListCallbackPage(
      res,
      'AniList login cancelled',
      'The authorization request was not completed. You can close this tab.',
      returnTo
    );
    return;
  }

  if (!code) {
    flow.status = 'failed';
    flow.error = 'AniList did not return an authorization code.';
    sendAniListCallbackPage(
      res,
      'AniList login failed',
      'AniList did not return an authorization code. You can close this tab and try again.',
      returnTo
    );
    return;
  }

  try {
    const accessToken = await exchangeAniListCodeForToken(code);
    const viewer = await anilist.getViewer(accessToken);
    flow.result =
      flow.type === 'link'
        ? await handleAniListLinkCallback(flow, accessToken, viewer)
        : await handleAniListLoginCallback(flow, accessToken, viewer);
    flow.status = 'completed';

    sendAniListCallbackPage(
      res,
      'AniList connected',
      'You can close this tab and return to Seenary.',
      returnTo
    );
  } catch (callbackError) {
    console.error('AniList OAuth callback error:', callbackError);
    flow.status = 'failed';
    flow.error = callbackError.message || 'Failed to finish AniList authorization.';
    sendAniListCallbackPage(
      res,
      'AniList login failed',
      'Seenary could not finish the AniList authorization. You can close this tab and try again.',
      returnTo
    );
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

  if (req.method === 'GET' && req.url.startsWith('/desktop-updates-debug')) {
    sendDesktopUpdatesDebug(req, res);
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/desktop-updates/')) {
    sendDesktopUpdateFile(req, res);
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/auth/anilist/callback')) {
    try {
      await handleAniListCallback(req, res);
    } catch (error) {
      console.error('AniList callback route error:', error);
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Failed to finish AniList authorization.');
    }
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
  deleteExpiredWebSessions();
  console.log(`Seenary API listening on port ${PORT}`);
});
