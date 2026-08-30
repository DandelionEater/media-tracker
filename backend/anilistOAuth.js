const crypto = require('crypto');
const http = require('http');
const fetch = require('node-fetch');
const { shell } = require('electron');

function requireEnvironmentValue(name) {
  const value = String(process.env[name] || '').trim();

  if (!value) {
    throw new Error(`${name} must be configured in backend/.env.`);
  }

  return value;
}

const CLIENT_ID = requireEnvironmentValue('ANILIST_CLIENT_ID');
const CLIENT_SECRET = requireEnvironmentValue('ANILIST_CLIENT_SECRET');
const CALLBACK_PORT = 37645;
const REDIRECT_URI = `http://127.0.0.1:${CALLBACK_PORT}/auth/anilist/callback`;
const AUTHORIZE_URL = 'https://anilist.co/api/v2/oauth/authorize';
const TOKEN_URL = 'https://anilist.co/api/v2/oauth/token';
const FLOW_TIMEOUT_MS = 2 * 60 * 1000;
const TOKEN_TIMEOUT_MS = 15 * 1000;

let activeServer = null;

function buildAuthorizeUrl(state) {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);
  return url.toString();
}

function sendCallbackPage(res, title, body) {
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
      </body>
    </html>
  `);
}

function stopActiveServer() {
  if (!activeServer) {
    return;
  }

  activeServer.close();
  activeServer = null;
}

function waitForAuthorizationCode(state) {
  stopActiveServer();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      stopActiveServer();
      reject(new Error('AniList login timed out.'));
    }, FLOW_TIMEOUT_MS);

    const server = http.createServer((req, res) => {
      const requestUrl = new URL(req.url, REDIRECT_URI);

      if (requestUrl.pathname !== '/auth/anilist/callback') {
        res.writeHead(404);
        res.end();
        return;
      }

      const returnedState = requestUrl.searchParams.get('state');
      const code = requestUrl.searchParams.get('code');
      const error = requestUrl.searchParams.get('error');

      if (error) {
        clearTimeout(timeout);
        sendCallbackPage(
          res,
          'AniList login cancelled',
          'The authorization request was not completed. You can close this tab.'
        );
        stopActiveServer();
        reject(new Error('AniList login was cancelled.'));
        return;
      }

      if (!code || returnedState !== state) {
        clearTimeout(timeout);
        sendCallbackPage(
          res,
          'AniList login failed',
          'The authorization response could not be verified. You can close this tab and try again.'
        );
        stopActiveServer();
        reject(new Error('Invalid AniList authorization response.'));
        return;
      }

      clearTimeout(timeout);
      sendCallbackPage(
        res,
        'AniList login complete',
        'You can close this tab and return to Seenary.'
      );
      stopActiveServer();
      resolve(code);
    });

    server.once('error', (error) => {
      clearTimeout(timeout);
      activeServer = null;

      if (error.code === 'EADDRINUSE') {
        reject(new Error('The AniList callback port is already in use.'));
        return;
      }

      reject(error);
    });

    server.listen(CALLBACK_PORT, '127.0.0.1', async () => {
      activeServer = server;

      try {
        await shell.openExternal(buildAuthorizeUrl(state));
      } catch (error) {
        clearTimeout(timeout);
        stopActiveServer();
        reject(error);
      }
    });
  });
}

async function exchangeCodeForToken(code) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TOKEN_TIMEOUT_MS);
  let response;
  let data;

  try {
    response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        code,
      }),
      signal: controller.signal,
    });
    data = await response.json().catch(() => null);
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('AniList token exchange timed out. Try logging in again.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok || !data?.access_token) {
    throw new Error(data?.message || 'Failed to exchange AniList authorization code.');
  }

  return data.access_token;
}

async function authorizeWithBrowser() {
  const state = crypto.randomBytes(24).toString('hex');
  const code = await waitForAuthorizationCode(state);
  return exchangeCodeForToken(code);
}

module.exports = {
  authorizeWithBrowser,
  REDIRECT_URI,
};
