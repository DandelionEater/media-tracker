require('./env');

const { app, ipcMain } = require('electron');
const path = require('path');

if (!app.isPackaged) {
  app.setPath('userData', path.join(__dirname, '.electron-user-data'));
  app.setPath('crashDumps', path.join(__dirname, '.electron-crash-dumps'));
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-software-rasterizer');
}

const { createWindow } = require('./window');
const { setupTray } = require('./tray');
const { registerShortcuts, registerShortcutIpc } = require('./shortcuts');
const { registerStartupIpc } = require('./startup');

const anilist = require('./anilist');
const anilistOAuth = require('./anilistOAuth');
const mal = require('./mal');
const { previewMalImport, importMalEntries } = require('./malImport');
const { previewTextImport, importTextEntries } = require('./textImport');
const { getMalTokenExpiry, withFreshMalAccount } = require('./malTokens');
const malOAuth = require('./malOAuth');
const {
  saveAnime,
  saveAnimeSummary,
  getAppSetting,
  setAppSetting,
  getSafeUserById,
  getUserByNormalizedUsername,
  getAniListAccountByAniListUserId,
  getAniListAccountByUserId,
  deleteAniListAccountByUserId,
  getMalAccountByMalUserId,
  getMalAccountByUserId,
  deleteMalAccountByUserId,
  mergeUserIntoUser,
  upsertAniListAccount,
  updateAniListAccountImportTime,
  upsertMalAccount,
  updateMalAccountImportTime,
  insertSyncHistory,
} = require('./db');
const { mapAnimeForDb } = require('./animeMapper');
const {
  registerUser,
  loginUser,
  createLinkedUser,
  loginUserById,
  logoutUser,
  getCurrentSession,
  setTutorialDismissedForCurrentUser,
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

const ANILIST_URL = 'https://graphql.anilist.co';
let mainWindow = null;

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

let pendingAniListSignup = null;
let pendingAniListLinkConflict = null;
let pendingMalSignup = null;
let pendingMalLinkConflict = null;

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
    coverImage: {
      large: media.coverImage?.large ?? null,
    },
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
    studios: {
      nodes: [],
    },
    tags: [],
    staff: {
      edges: [],
    },
    characters: {
      edges: [],
    },
    relations: {
      edges: [],
    },
    recommendations: {
      nodes: [],
    },
    externalLinks: [],
    streamingEpisodes: [],
  });
}

function sanitizeImportStatus(status) {
  const value = String(status || '')
    .trim()
    .toUpperCase();

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
        coverImage: {
          large: media.coverImage?.large ?? null,
        },
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

async function importAuthenticatedAniListList(accessToken, viewer) {
  const collection = await anilist.getViewerAnimeCollection(accessToken, viewer.id);
  const result = importAniListEntries(getCurrentSession(), collection, viewer.name, {
    selectedStatuses: IMPORT_STATUS_ORDER,
    selectedAnimeIds: [],
  });

  if (result.ok) {
    updateAniListAccountImportTime(viewer.id);
  }

  return result;
}

async function finishAniListLogin({ accessToken, viewer, userId }) {
  deleteAniListAccountByUserId(userId);
  deleteMalAccountByUserId(userId);

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

  let importResult;

  try {
    importResult = await importAuthenticatedAniListList(accessToken, viewer);
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

function getAniListLinkStatus(currentSession) {
  if (!currentSession?.authenticated || !currentSession.user?.id) {
    return { ok: false, message: 'You must be logged in.', linked: false };
  }

  const linkedAccount = getAniListAccountByUserId(currentSession.user.id);

  if (!linkedAccount) {
    return { ok: true, linked: false, account: null };
  }

  return {
    ok: true,
    linked: true,
    account: {
      anilistUserId: linkedAccount.anilist_user_id,
      anilistUsername: linkedAccount.anilist_username,
      originalAniListUsername: linkedAccount.original_anilist_username,
      lastImportAt: linkedAccount.last_import_at,
      updatedAt: linkedAccount.updated_at,
    },
  };
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

function buildMalAccountPayload(account) {
  return {
    malUserId: account.mal_user_id,
    malUsername: account.mal_username,
    originalMalUsername: account.original_mal_username,
    lastImportAt: account.last_import_at,
    updatedAt: account.updated_at,
  };
}

async function linkAniListToUser({ accessToken, viewer, userId }) {
  deleteAniListAccountByUserId(userId);
  deleteMalAccountByUserId(userId);
  upsertAniListAccount({
    userId,
    anilistUserId: viewer.id,
    anilistUsername: viewer.name,
    originalAniListUsername: viewer.name,
    accessToken,
  });

  const importResult = await importAuthenticatedAniListList(accessToken, viewer).catch((error) => {
    console.error('AniList link import error:', error);
    return {
      ok: false,
      message: error.message || 'Failed to import AniList list.',
    };
  });

  return {
    ok: true,
    linked: true,
    message: importResult.ok
      ? `Linked AniList account ${viewer.name} and imported your list.`
      : `Linked AniList account ${viewer.name}, but list import failed.`,
    account: {
      anilistUserId: viewer.id,
      anilistUsername: viewer.name,
      originalAniListUsername: viewer.name,
      lastImportAt: importResult.ok ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
    },
    import: importResult,
  };
}

async function finishMalLogin({ tokenData, viewer, userId }) {
  deleteAniListAccountByUserId(userId);
  deleteMalAccountByUserId(userId);

  upsertMalAccount({
    userId,
    malUserId: viewer.id,
    malUsername: viewer.name,
    originalMalUsername: viewer.name,
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    tokenExpiresAt: getMalTokenExpiry(tokenData),
  });

  const loginResult = loginUserById(userId);

  if (!loginResult.ok) {
    return loginResult;
  }

  return {
    ok: true,
    message: 'Logged in with MyAnimeList.',
    user: loginResult.user,
    import: {
      ok: true,
      message: 'MyAnimeList import preview will be available in the sync step.',
    },
  };
}

async function linkMalToUser({ tokenData, viewer, userId }) {
  deleteAniListAccountByUserId(userId);
  deleteMalAccountByUserId(userId);

  upsertMalAccount({
    userId,
    malUserId: viewer.id,
    malUsername: viewer.name,
    originalMalUsername: viewer.name,
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    tokenExpiresAt: getMalTokenExpiry(tokenData),
  });

  const account = getMalAccountByUserId(userId);

  return {
    ok: true,
    linked: true,
    message: `Linked MyAnimeList account ${viewer.name}.`,
    account: account ? buildMalAccountPayload(account) : null,
  };
}

ipcMain.handle('anilist:search', async (_event, payload) => {
  const query = typeof payload === 'string' ? payload : payload?.query;
  const hideAdultContent =
    typeof payload === 'object' && payload !== null ? payload.hideAdultContent : undefined;

  return await anilist.searchAnime(query, { hideAdultContent });
});

ipcMain.handle('anilist:trending', async (_event, payload) => {
  const hideAdultContent =
    typeof payload === 'object' && payload !== null ? payload.hideAdultContent : undefined;

  return await anilist.getTrendingAnime({ hideAdultContent });
});

ipcMain.handle('anilist:discover', async (_event, payload) => {
  const hideAdultContent =
    typeof payload === 'object' && payload !== null ? payload.hideAdultContent : undefined;

  return await anilist.getDiscoverAnime({ hideAdultContent });
});

ipcMain.handle('anilist:discover-shelf', async (_event, payload) => {
  return await anilist.getDiscoverShelfAnime({
    shelfId: payload?.shelfId,
    page: payload?.page,
    hideAdultContent: payload?.hideAdultContent,
  });
});

ipcMain.handle('anilist:preview-import', async (_event, payload) => {
  try {
    const username = String(payload?.username || '').trim();

    if (!username) {
      return { ok: false, message: 'Enter an AniList username first.' };
    }

    const collection = await anilist.getUserAnimeCollection(username);
    const preview = buildAniListImportPreview(collection);

    if (!preview.totalFound) {
      return {
        ok: false,
        message: `No anime list data was found for ${username}.`,
      };
    }

    return {
      ok: true,
      username,
      preview,
    };
  } catch (error) {
    console.error('AniList preview error:', error);
    return {
      ok: false,
      message: error.message || 'Failed to preview AniList list.',
    };
  }
});

ipcMain.handle('anilist:import-list', async (_event, payload) => {
  try {
    const username = String(payload?.username || '').trim();
    const selectedStatuses = Array.isArray(payload?.selectedStatuses)
      ? payload.selectedStatuses
      : [];
    const selectedAnimeIds = Array.isArray(payload?.selectedAnimeIds)
      ? payload.selectedAnimeIds
      : [];

    if (!username) {
      return { ok: false, message: 'Enter an AniList username first.' };
    }

    const collection = await anilist.getUserAnimeCollection(username);

    if (!collection?.lists?.length) {
      return {
        ok: false,
        message: `No anime list data was found for ${username}.`,
      };
    }

    return importAniListEntries(getCurrentSession(), collection, username, {
      selectedStatuses,
      selectedAnimeIds,
    });
  } catch (error) {
    console.error('AniList import error:', error);
    return {
      ok: false,
      message: error.message || 'Failed to import AniList list.',
    };
  }
});

ipcMain.handle('mal:preview-import', async () => {
  try {
    const session = getCurrentSession();

    if (!session.authenticated || !session.user?.id) {
      return { ok: false, message: 'You must be logged in.' };
    }

    const malList = await withFreshMalAccount(session.user.id, async (linkedAccount) => {
      if (!linkedAccount?.access_token) {
        throw new Error('Link a MyAnimeList account before importing.');
      }

      return await mal.getViewerAnimeList(linkedAccount.access_token);
    });
    const result = await previewMalImport(malList);
    return {
      ok: true,
      message: `Found ${result.preview.totalFound} MyAnimeList entries.`,
      username: result.username,
      preview: result.preview,
    };
  } catch (error) {
    console.error('MyAnimeList preview error:', error);
    return { ok: false, message: error.message || 'Failed to preview MyAnimeList list.' };
  }
});

ipcMain.handle('mal:import-list', async (_event, payload) => {
  try {
    const session = getCurrentSession();

    if (!session.authenticated || !session.user?.id) {
      return { ok: false, message: 'You must be logged in.' };
    }

    let linkedAccount = null;
    const malList = await withFreshMalAccount(session.user.id, async (account) => {
      if (!account?.access_token) {
        throw new Error('Link a MyAnimeList account before importing.');
      }

      linkedAccount = account;
      return await mal.getViewerAnimeList(account.access_token);
    });
    const result = await importMalEntries(session, malList, {
      selectedStatuses: payload?.selectedStatuses,
      selectedAnimeIds: payload?.selectedAnimeIds,
    });

    if (result.ok) {
      updateMalAccountImportTime(linkedAccount.mal_user_id);
    }

    return result;
  } catch (error) {
    console.error('MyAnimeList import error:', error);
    return { ok: false, message: error.message || 'Failed to import MyAnimeList list.' };
  }
});

ipcMain.handle('text-import:preview', async (_event, payload) => {
  try {
    return await previewTextImport(payload?.text, {
      hideAdultContent: payload?.hideAdultContent,
    });
  } catch (error) {
    console.error('Text import preview error:', error);
    return { ok: false, message: error.message || 'Failed to preview text import.' };
  }
});

ipcMain.handle('text-import:import', (_event, payload) => {
  try {
    return importTextEntries(getCurrentSession(), payload?.entries, payload?.selectedAnimeIds);
  } catch (error) {
    console.error('Text import error:', error);
    return { ok: false, message: error.message || 'Failed to import text list.' };
  }
});

ipcMain.handle('settings:get', () => {
  return getAppPreferences();
});

ipcMain.handle('settings:update', (_event, payload) => {
  return updateAppPreferences(payload);
});

ipcMain.handle('sync:get-status', () => {
  try {
    const session = getCurrentSession();

    if (!session.authenticated || !session.user?.id) {
      return { ok: false, message: 'You must be logged in.' };
    }

    return getSyncStatus(session.user.id);
  } catch (error) {
    console.error('Sync status error:', error);
    return { ok: false, message: 'Failed to load sync status.' };
  }
});

ipcMain.handle('sync:set-auto', (_event, enabled) => {
  try {
    const session = getCurrentSession();

    if (!session.authenticated || !session.user?.id) {
      return { ok: false, message: 'You must be logged in.' };
    }

    setAutoSyncEnabled(session.user.id, Boolean(enabled));
    return getSyncStatus(session.user.id);
  } catch (error) {
    console.error('Sync setting error:', error);
    return { ok: false, message: 'Failed to update sync setting.' };
  }
});

ipcMain.handle('sync:run-now', async () => {
  try {
    const session = getCurrentSession();

    if (!session.authenticated || !session.user?.id) {
      return { ok: false, message: 'You must be logged in.' };
    }

    return await runSyncForUser(session.user.id);
  } catch (error) {
    console.error('Manual sync error:', error);
    return { ok: false, message: error.message || 'Failed to run sync.' };
  }
});

ipcMain.handle('sync:pull-from-anilist', async () => {
  try {
    const session = getCurrentSession();

    if (!session.authenticated || !session.user?.id) {
      return { ok: false, message: 'You must be logged in.' };
    }

    const linkedAccount = getAniListAccountByUserId(session.user.id);

    if (!linkedAccount?.access_token || !linkedAccount?.anilist_user_id) {
      return { ok: false, message: 'Link an AniList account before updating from AniList.' };
    }

    const collection = await anilist.getViewerAnimeCollection(
      linkedAccount.access_token,
      linkedAccount.anilist_user_id
    );
    const result = importAniListEntries(session, collection, linkedAccount.anilist_username, {
      selectedStatuses: IMPORT_STATUS_ORDER,
      selectedAnimeIds: [],
    });

    if (result.ok) {
      updateAniListAccountImportTime(linkedAccount.anilist_user_id);
      for (const change of result.summary?.changes || []) {
        insertSyncHistory({
          userId: session.user.id,
          animeId: change.animeId,
          animeTitle: change.animeTitle,
          operation: 'pull_from_anilist',
          changedFields: change.changedFields,
          status: 'completed',
          message: 'Updated local entry from AniList.',
        });
      }
    }

    return {
      ...result,
      message: result.ok
        ? `Updated local list from AniList. ${result.summary?.created ?? 0} created, ${result.summary?.updated ?? 0} updated.`
        : result.message,
    };
  } catch (error) {
    console.error('AniList pull sync error:', error);
    return {
      ok: false,
      message: error.message || 'Failed to update from AniList.',
    };
  }
});

ipcMain.handle('sync:get-activity', () => {
  try {
    const session = getCurrentSession();

    if (!session.authenticated || !session.user?.id) {
      return { ok: false, message: 'You must be logged in.' };
    }

    return getSyncActivity(session.user.id);
  } catch (error) {
    console.error('Sync activity error:', error);
    return { ok: false, message: 'Failed to load sync activity.' };
  }
});

ipcMain.handle('sync:pull-from-mal', async () => {
  try {
    const session = getCurrentSession();

    if (!session.authenticated || !session.user?.id) {
      return { ok: false, message: 'You must be logged in.' };
    }

    let linkedAccount = null;
    const malList = await withFreshMalAccount(session.user.id, async (account) => {
      if (!account?.access_token) {
        throw new Error('Link a MyAnimeList account before updating from MyAnimeList.');
      }

      linkedAccount = account;
      return await mal.getViewerAnimeList(account.access_token);
    });
    const result = await importMalEntries(session, malList, {
      selectedStatuses: IMPORT_STATUS_ORDER,
      selectedAnimeIds: [],
    });

    if (result.ok) {
      updateMalAccountImportTime(linkedAccount.mal_user_id);
      for (const change of result.summary?.changes || []) {
        insertSyncHistory({
          userId: session.user.id,
          animeId: change.animeId,
          animeTitle: change.animeTitle,
          operation: 'pull_from_mal',
          changedFields: change.changedFields,
          status: 'completed',
          message: 'Updated local entry from MyAnimeList.',
        });
      }
    }

    return result;
  } catch (error) {
    console.error('MyAnimeList pull error:', error);
    return { ok: false, message: error.message || 'Failed to update from MyAnimeList.' };
  }
});

async function fetchAnimeDetailsFromAniList(id) {
  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
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

        tags {
          id
          name
          description
          rank
          isMediaSpoiler
          isGeneralSpoiler
        }

        characters(perPage: 20) {
          edges {
            role
            node {
              id
              name {
                full
                native
                userPreferred
              }
              image {
                large
              }
            }
            voiceActors(language: JAPANESE) {
              id
              name {
                full
                native
                userPreferred
              }
              language
              image {
                large
              }
            }
          }
        }

        staff(perPage: 20) {
          edges {
            role
            node {
              id
              name {
                full
                native
                userPreferred
              }
              image {
                large
              }
            }
          }
        }

        relations {
          edges {
            relationType
            node {
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
              title {
                romaji
                english
                native
                userPreferred
              }
              coverImage {
                large
              }
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

        streamingEpisodes {
          title
          thumbnail
          url
          site
        }
      }
    }
  `;

  const response = await fetch(ANILIST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      query,
      variables: { id },
    }),
  });

  if (!response.ok) {
    throw new Error(`AniList request failed with status ${response.status}`);
  }

  const data = await response.json();

  if (data.errors) {
    throw new Error(data.errors[0]?.message || 'AniList returned an error');
  }

  return data.data.Media;
}

ipcMain.handle('anime:get-details', async (_event, id) => {
  try {
    const media = await fetchAnimeDetailsFromAniList(id);

    const mappedAnime = mapAnimeForDb(media);
    saveAnime(mappedAnime);

    return media;
  } catch (error) {
    console.error('Failed to fetch anime details:', error);
    throw error;
  }
});

ipcMain.handle('anime:cache-minimal', async (_event, media) => {
  try {
    if (!media?.id) {
      return { ok: false, message: 'Invalid anime data.' };
    }

    const mappedAnime = buildMinimalAnimeForDb(media);
    saveAnimeSummary(mappedAnime);

    return { ok: true };
  } catch (error) {
    console.error('Failed to cache minimal anime:', error);
    return { ok: false, message: 'Failed to cache anime.' };
  }
});

ipcMain.handle('auth:anilist-start', async () => {
  try {
    const accessToken = await anilistOAuth.authorizeWithBrowser();
    const viewer = await anilist.getViewer(accessToken);

    if (!viewer?.id || !viewer?.name) {
      return { ok: false, message: 'AniList did not return account details.' };
    }

    const linkedAccount = getAniListAccountByAniListUserId(viewer.id);

    if (linkedAccount?.user_id) {
      pendingAniListSignup = null;
      return await finishAniListLogin({
        accessToken,
        viewer,
        userId: linkedAccount.user_id,
      });
    }

    pendingAniListSignup = {
      accessToken,
      viewer,
      createdAt: Date.now(),
    };

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
  } catch (error) {
    console.error('AniList OAuth start error:', error);
    return {
      ok: false,
      message: error.message || 'Failed to log in with AniList.',
    };
  }
});

ipcMain.handle('auth:anilist-complete', async (_event, payload) => {
  try {
    if (!pendingAniListSignup?.accessToken || !pendingAniListSignup?.viewer) {
      return { ok: false, message: 'AniList login session expired. Try again.' };
    }

    if (Date.now() - pendingAniListSignup.createdAt > 10 * 60 * 1000) {
      pendingAniListSignup = null;
      return { ok: false, message: 'AniList login session expired. Try again.' };
    }

    const username = String(payload?.username || '').trim();
    const usernameError = validateUsername(username);

    if (usernameError) {
      return { ok: false, message: usernameError };
    }

    const usernameNormalized = normalizeUsername(username);

    if (getUserByNormalizedUsername(usernameNormalized)) {
      return { ok: false, message: 'Username is already taken.' };
    }

    const signup = pendingAniListSignup;
    const created = await createLinkedUser(username);

    if (!created.ok || !created.user) {
      return created;
    }

    pendingAniListSignup = null;

    return await finishAniListLogin({
      accessToken: signup.accessToken,
      viewer: signup.viewer,
      userId: created.user.id,
    });
  } catch (error) {
    console.error('AniList OAuth complete error:', error);
    return {
      ok: false,
      message: error.message || 'Failed to finish AniList login.',
    };
  }
});

ipcMain.handle('auth:mal-start', async () => {
  try {
    const tokenData = await malOAuth.authorizeWithBrowser();
    const viewer = await mal.getViewer(tokenData.access_token);

    if (!viewer?.id || !viewer?.name) {
      return { ok: false, message: 'MyAnimeList did not return account details.' };
    }

    const linkedAccount = getMalAccountByMalUserId(viewer.id);

    if (linkedAccount?.user_id) {
      pendingMalSignup = null;
      return await finishMalLogin({
        tokenData,
        viewer,
        userId: linkedAccount.user_id,
      });
    }

    pendingMalSignup = {
      tokenData,
      viewer,
      createdAt: Date.now(),
    };

    return {
      ok: true,
      needsProfile: true,
      message: 'MyAnimeList account verified. Choose your local display name.',
      mal: {
        id: viewer.id,
        username: viewer.name,
      },
      suggestedUsername: viewer.name,
    };
  } catch (error) {
    console.error('MyAnimeList OAuth start error:', error);
    return {
      ok: false,
      message: error.message || 'Failed to log in with MyAnimeList.',
    };
  }
});

ipcMain.handle('auth:mal-complete', async (_event, payload) => {
  try {
    if (!pendingMalSignup?.tokenData || !pendingMalSignup?.viewer) {
      return { ok: false, message: 'MyAnimeList login session expired. Try again.' };
    }

    if (Date.now() - pendingMalSignup.createdAt > 10 * 60 * 1000) {
      pendingMalSignup = null;
      return { ok: false, message: 'MyAnimeList login session expired. Try again.' };
    }

    const username = String(payload?.username || '').trim();
    const usernameError = validateUsername(username);

    if (usernameError) {
      return { ok: false, message: usernameError };
    }

    const usernameNormalized = normalizeUsername(username);

    if (getUserByNormalizedUsername(usernameNormalized)) {
      return { ok: false, message: 'Username is already taken.' };
    }

    const signup = pendingMalSignup;
    const created = await createLinkedUser(username);

    if (!created.ok || !created.user) {
      return created;
    }

    pendingMalSignup = null;

    return await finishMalLogin({
      tokenData: signup.tokenData,
      viewer: signup.viewer,
      userId: created.user.id,
    });
  } catch (error) {
    console.error('MyAnimeList OAuth complete error:', error);
    return {
      ok: false,
      message: error.message || 'Failed to finish MyAnimeList login.',
    };
  }
});

ipcMain.handle('auth:anilist-link-status', () => {
  try {
    return getAniListLinkStatus(getCurrentSession());
  } catch (error) {
    console.error('AniList link status error:', error);
    return { ok: false, message: 'Failed to load AniList link status.', linked: false };
  }
});

ipcMain.handle('auth:anilist-link', async () => {
  try {
    const session = getCurrentSession();

    if (!session.authenticated || !session.user?.id) {
      return { ok: false, message: 'You must be logged in.', linked: false };
    }

    const accessToken = await anilistOAuth.authorizeWithBrowser();
    const viewer = await anilist.getViewer(accessToken);

    if (!viewer?.id || !viewer?.name) {
      return { ok: false, message: 'AniList did not return account details.', linked: false };
    }

    const existingLinkedAccount = getAniListAccountByAniListUserId(viewer.id);

    if (
      existingLinkedAccount?.user_id &&
      Number(existingLinkedAccount.user_id) !== Number(session.user.id)
    ) {
      const existingUser = getSafeUserById(existingLinkedAccount.user_id);

      pendingAniListLinkConflict = {
        accessToken,
        viewer,
        sourceUserId: Number(existingLinkedAccount.user_id),
        targetUserId: Number(session.user.id),
        createdAt: Date.now(),
      };

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
            id: session.user.id,
            username: session.user.username,
          },
        },
      };
    }

    pendingAniListLinkConflict = null;

    return await linkAniListToUser({
      accessToken,
      viewer,
      userId: session.user.id,
    });
  } catch (error) {
    console.error('AniList link error:', error);
    return {
      ok: false,
      linked: false,
      message: error.message || 'Failed to link AniList account.',
    };
  }
});

ipcMain.handle('auth:anilist-resolve-link-conflict', async (_event, payload) => {
  try {
    const session = getCurrentSession();

    if (!session.authenticated || !session.user?.id) {
      return { ok: false, message: 'You must be logged in.', linked: false };
    }

    if (!pendingAniListLinkConflict) {
      return { ok: false, message: 'No AniList link conflict is waiting.', linked: false };
    }

    if (Date.now() - pendingAniListLinkConflict.createdAt > 10 * 60 * 1000) {
      pendingAniListLinkConflict = null;
      return { ok: false, message: 'AniList link conflict expired. Try linking again.', linked: false };
    }

    if (Number(pendingAniListLinkConflict.targetUserId) !== Number(session.user.id)) {
      pendingAniListLinkConflict = null;
      return { ok: false, message: 'AniList link conflict no longer matches this account.', linked: false };
    }

    const action = String(payload?.action || '').trim();

    if (!['transfer', 'merge'].includes(action)) {
      return { ok: false, message: 'Choose transfer or merge.', linked: false };
    }

    const conflict = pendingAniListLinkConflict;
    pendingAniListLinkConflict = null;

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
  } catch (error) {
    console.error('AniList link conflict resolution error:', error);
    return {
      ok: false,
      linked: false,
      message: error.message || 'Failed to resolve AniList link conflict.',
    };
  }
});

ipcMain.handle('auth:mal-link-status', () => {
  try {
    const session = getCurrentSession();

    if (!session?.authenticated || !session.user?.id) {
      return { ok: false, message: 'You must be logged in.', linked: false };
    }

    const linkedAccount = getMalAccountByUserId(session.user.id);

    return {
      ok: true,
      linked: Boolean(linkedAccount),
      account: linkedAccount ? buildMalAccountPayload(linkedAccount) : null,
    };
  } catch (error) {
    console.error('MyAnimeList link status error:', error);
    return { ok: false, message: 'Failed to load MyAnimeList link status.', linked: false };
  }
});

ipcMain.handle('auth:mal-link', async () => {
  try {
    const session = getCurrentSession();

    if (!session.authenticated || !session.user?.id) {
      return { ok: false, message: 'You must be logged in.', linked: false };
    }

    const tokenData = await malOAuth.authorizeWithBrowser();
    const viewer = await mal.getViewer(tokenData.access_token);

    if (!viewer?.id || !viewer?.name) {
      return { ok: false, message: 'MyAnimeList did not return account details.', linked: false };
    }

    const existingLinkedAccount = getMalAccountByMalUserId(viewer.id);

    if (
      existingLinkedAccount?.user_id &&
      Number(existingLinkedAccount.user_id) !== Number(session.user.id)
    ) {
      const existingUser = getSafeUserById(existingLinkedAccount.user_id);

      pendingMalLinkConflict = {
        tokenData,
        viewer,
        sourceUserId: Number(existingLinkedAccount.user_id),
        targetUserId: Number(session.user.id),
        createdAt: Date.now(),
      };

      return {
        ok: true,
        message: `MyAnimeList account ${viewer.name} is already linked to another local account.`,
        linked: false,
        needsConflictResolution: true,
        conflict: {
          malUserId: viewer.id,
          malUsername: viewer.name,
          sourceUser: existingUser
            ? {
                id: existingUser.id,
                username: existingUser.username,
              }
            : null,
          targetUser: {
            id: session.user.id,
            username: session.user.username,
          },
        },
      };
    }

    pendingMalLinkConflict = null;

    return await linkMalToUser({
      tokenData,
      viewer,
      userId: session.user.id,
    });
  } catch (error) {
    console.error('MyAnimeList link error:', error);
    return {
      ok: false,
      linked: false,
      message: error.message || 'Failed to link MyAnimeList account.',
    };
  }
});

ipcMain.handle('auth:mal-resolve-link-conflict', async (_event, payload) => {
  try {
    const session = getCurrentSession();

    if (!session.authenticated || !session.user?.id) {
      return { ok: false, message: 'You must be logged in.', linked: false };
    }

    if (!pendingMalLinkConflict) {
      return { ok: false, message: 'No MyAnimeList link conflict is waiting.', linked: false };
    }

    if (Date.now() - pendingMalLinkConflict.createdAt > 10 * 60 * 1000) {
      pendingMalLinkConflict = null;
      return { ok: false, message: 'MyAnimeList link conflict expired. Try linking again.', linked: false };
    }

    if (Number(pendingMalLinkConflict.targetUserId) !== Number(session.user.id)) {
      pendingMalLinkConflict = null;
      return { ok: false, message: 'MyAnimeList link conflict no longer matches this account.', linked: false };
    }

    const action = String(payload?.action || '').trim();

    if (!['transfer', 'merge'].includes(action)) {
      return { ok: false, message: 'Choose transfer or merge.', linked: false };
    }

    const conflict = pendingMalLinkConflict;
    pendingMalLinkConflict = null;

    let mergeSummary = null;

    if (action === 'merge') {
      mergeSummary = mergeUserIntoUser(conflict.sourceUserId, conflict.targetUserId);
    }

    const result = await linkMalToUser({
      tokenData: conflict.tokenData,
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
  } catch (error) {
    console.error('MyAnimeList link conflict resolution error:', error);
    return {
      ok: false,
      linked: false,
      message: error.message || 'Failed to resolve MyAnimeList link conflict.',
    };
  }
});

ipcMain.handle('auth:register', async (_event, payload) => {
  try {
    const username = payload?.username ?? '';
    const password = payload?.password ?? '';
    return await registerUser(username, password);
  } catch (error) {
    console.error('Register error:', error);
    return { ok: false, message: 'Failed to create account.' };
  }
});

ipcMain.handle('auth:login', async (_event, payload) => {
  try {
    const username = payload?.username ?? '';
    const password = payload?.password ?? '';
    return await loginUser(username, password);
  } catch (error) {
    console.error('Login error:', error);
    return { ok: false, message: 'Failed to log in.' };
  }
});

ipcMain.handle('auth:logout', () => {
  try {
    return logoutUser();
  } catch (error) {
    console.error('Logout error:', error);
    return { ok: false, message: 'Failed to log out.' };
  }
});

ipcMain.handle('auth:get-session', () => {
  try {
    return getCurrentSession();
  } catch (error) {
    console.error('Session error:', error);
    return { authenticated: false, user: null };
  }
});

ipcMain.handle('auth:set-tutorial-dismissed', (_event, dismissed) => {
  try {
    return setTutorialDismissedForCurrentUser(Boolean(dismissed));
  } catch (error) {
    console.error('Tutorial preference update error:', error);
    return { ok: false, message: 'Failed to update tutorial preference.', user: null };
  }
});

ipcMain.handle('list:get', () => {
  try {
    return getMyAnimeList(getCurrentSession());
  } catch (error) {
    console.error('List get error:', error);
    return { ok: false, message: 'Failed to load list.', entries: [] };
  }
});

ipcMain.handle('list:get-entry', (_event, animeId) => {
  try {
    return getMyAnimeEntry(getCurrentSession(), animeId);
  } catch (error) {
    console.error('List get entry error:', error);
    return { ok: false, message: 'Failed to load list entry.', entry: null };
  }
});

ipcMain.handle('list:save-entry', (_event, payload) => {
  try {
    const animeId = payload?.animeId;
    const data = payload?.data ?? {};
    return saveMyAnimeEntry(getCurrentSession(), animeId, data);
  } catch (error) {
    console.error('List save entry error:', error);
    return { ok: false, message: 'Failed to save list entry.' };
  }
});

ipcMain.handle('list:remove-entry', (_event, animeId) => {
  try {
    return removeMyAnimeEntry(getCurrentSession(), animeId);
  } catch (error) {
    console.error('List remove entry error:', error);
    return { ok: false, message: 'Failed to remove list entry.' };
  }
});

ipcMain.handle('list:clear', () => {
  try {
    return clearMyAnimeList(getCurrentSession());
  } catch (error) {
    console.error('List clear error:', error);
    return { ok: false, message: 'Failed to clear your list.', removedCount: 0 };
  }
});

function bootAppWindow() {
  mainWindow = createWindow();

  setupTray(mainWindow);
  registerShortcuts(mainWindow);
  registerShortcutIpc(() => mainWindow);
  registerStartupIpc();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  bootAppWindow();

  app.on('activate', () => {
    if (!mainWindow) {
      bootAppWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
