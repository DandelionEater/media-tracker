const fetch = require('node-fetch');

const MAL_API_URL = 'https://api.myanimelist.net/v2';
const MAL_TOKEN_URL = 'https://myanimelist.net/v1/oauth2/token';

function getClientId() {
  return process.env.MAL_CLIENT_ID || '';
}

function getClientSecret() {
  return process.env.MAL_CLIENT_SECRET || '';
}

function requireClientId() {
  const clientId = getClientId();

  if (!clientId) {
    throw new Error('Set MAL_CLIENT_ID before using MyAnimeList login or sync.');
  }

  return clientId;
}

function buildMalRequestError(data, fallbackMessage, response) {
  const error = new Error(data?.message || data?.error_description || data?.error || fallbackMessage);
  error.status = response.status;
  error.statusText = response.statusText;
  error.data = data;
  return error;
}

async function exchangeCodeForToken({ code, codeVerifier, redirectUri }) {
  const clientId = requireClientId();
  const clientSecret = getClientSecret();
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    code,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
  });

  if (clientSecret) {
    body.set('client_secret', clientSecret);
  }

  const response = await fetch(MAL_TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.access_token) {
    throw buildMalRequestError(data, 'Failed to exchange MyAnimeList authorization code.', response);
  }

  return data;
}

async function refreshAccessToken(refreshToken) {
  const clientId = requireClientId();
  const clientSecret = getClientSecret();
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: refreshToken,
  });

  if (clientSecret) {
    body.set('client_secret', clientSecret);
  }

  const response = await fetch(MAL_TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.access_token) {
    throw buildMalRequestError(data, 'Failed to refresh MyAnimeList authorization.', response);
  }

  return data;
}

async function malRequest(path, { accessToken, method = 'GET', body = null, query = null } = {}) {
  const url = new URL(`${MAL_API_URL}${path}`);

  for (const [key, value] of Object.entries(query || {})) {
    if (value !== null && value !== undefined && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url.toString(), {
    method,
    headers: {
      Accept: 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: body ? body.toString() : undefined,
  });
  const data = response.status === 204 ? null : await response.json().catch(() => null);

  if (!response.ok) {
    throw buildMalRequestError(data, `MyAnimeList request failed with status ${response.status}`, response);
  }

  return data;
}

async function getViewer(accessToken) {
  return await malRequest('/users/@me', {
    accessToken,
    query: {
      fields: 'id,name',
    },
  });
}

async function getViewerAnimeList(accessToken, options = {}) {
  return await getUserAnimeList('@me', {
    ...options,
    accessToken,
  });
}

async function getUserAnimeList(username, options = {}) {
  const limit = Math.min(Math.max(Number(options.limit || 100), 1), 1000);
  const fields = [
    'id',
    'title',
    'main_picture',
    'alternative_titles',
    'start_date',
    'end_date',
    'synopsis',
    'mean',
    'rank',
    'popularity',
    'num_episodes',
    'media_type',
    'status',
    'genres',
    'my_list_status',
  ].join(',');
  const data = [];
  let nextUrl = null;
  let offset = 0;

  do {
    const page = nextUrl
      ? await fetchNextPage(nextUrl, options.accessToken)
      : await malRequest(`/users/${encodeURIComponent(username)}/animelist`, {
          accessToken: options.accessToken,
          query: {
            fields,
            limit,
            offset,
            nsfw: 'true',
          },
        });

    data.push(...(page?.data || []));
    nextUrl = page?.paging?.next || null;
    offset += limit;
  } while (nextUrl && data.length < (options.maxEntries || 5000));

  return {
    userName: username,
    data,
  };
}

async function searchAnime(search, options = {}) {
  const query = String(search || '').trim();

  if (!query) {
    return [];
  }

  const data = await malRequest('/anime', {
    accessToken: options.accessToken,
    query: {
      q: query,
      limit: Math.min(Math.max(Number(options.limit || 10), 1), 100),
      nsfw: 'true',
      fields: [
        'id',
        'title',
        'main_picture',
        'alternative_titles',
        'start_date',
        'end_date',
        'num_episodes',
        'media_type',
        'status',
      ].join(','),
    },
  });

  return (data?.data || []).map((item) => item.node).filter(Boolean);
}

async function fetchNextPage(url, accessToken) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw buildMalRequestError(data, `MyAnimeList request failed with status ${response.status}`, response);
  }

  return data;
}

function mapStatus(status) {
  switch (status) {
    case 'watching':
      return 'watching';
    case 'planned':
      return 'plan_to_watch';
    case 'completed':
      return 'completed';
    case 'paused':
      return 'on_hold';
    case 'dropped':
      return 'dropped';
    default:
      return 'plan_to_watch';
  }
}

function buildListStatusPayload(entry) {
  const body = new URLSearchParams({
    status: mapStatus(entry.status),
    num_watched_episodes: String(entry.progress ?? 0),
  });

  if (entry.score !== null && entry.score !== undefined && entry.score !== '') {
    body.set('score', String(Math.min(10, Math.max(0, Math.round(Number(entry.score) || 0)))));
  }

  if (entry.notes !== null && entry.notes !== undefined) {
    body.set('comments', String(entry.notes));
  }

  if (entry.started_at) {
    body.set('start_date', entry.started_at);
  }

  if (entry.completed_at) {
    body.set('finish_date', entry.completed_at);
  }

  return body;
}

async function saveAnimeListStatus(accessToken, malAnimeId, entry) {
  return await malRequest(`/anime/${malAnimeId}/my_list_status`, {
    accessToken,
    method: 'PATCH',
    body: buildListStatusPayload(entry),
  });
}

async function deleteAnimeListStatus(accessToken, malAnimeId) {
  try {
    return await malRequest(`/anime/${malAnimeId}/my_list_status`, {
      accessToken,
      method: 'DELETE',
    });
  } catch (error) {
    if (Number(error?.status) === 404) {
      return {
        deleted: true,
        alreadyDeleted: true,
      };
    }

    throw error;
  }
}

module.exports = {
  exchangeCodeForToken,
  refreshAccessToken,
  getViewer,
  getViewerAnimeList,
  getUserAnimeList,
  searchAnime,
  saveAnimeListStatus,
  deleteAnimeListStatus,
  requireClientId,
};
