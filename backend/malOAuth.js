const crypto = require('crypto');
const http = require('http');
const { shell } = require('electron');

const mal = require('./mal');

const CALLBACK_PORT = 4000;
const REDIRECT_URI = `http://127.0.0.1:${CALLBACK_PORT}/auth/mal/callback`;
const AUTHORIZE_URL = 'https://myanimelist.net/v1/oauth2/authorize';
const FLOW_TIMEOUT_MS = 2 * 60 * 1000;

let activeServer = null;

function createCodeVerifier() {
  return crypto.randomBytes(48).toString('base64url');
}

function buildAuthorizeUrl(state, codeVerifier) {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', mal.requireClientId());
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeVerifier);
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

function waitForAuthorizationCode(state, codeVerifier) {
  stopActiveServer();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      stopActiveServer();
      reject(new Error('MyAnimeList login timed out.'));
    }, FLOW_TIMEOUT_MS);

    const server = http.createServer((req, res) => {
      const requestUrl = new URL(req.url, REDIRECT_URI);

      if (requestUrl.pathname !== '/auth/mal/callback') {
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
          'MyAnimeList login cancelled',
          'The authorization request was not completed. You can close this tab.'
        );
        stopActiveServer();
        reject(new Error('MyAnimeList login was cancelled.'));
        return;
      }

      if (!code || returnedState !== state) {
        clearTimeout(timeout);
        sendCallbackPage(
          res,
          'MyAnimeList login failed',
          'The authorization response could not be verified. You can close this tab and try again.'
        );
        stopActiveServer();
        reject(new Error('Invalid MyAnimeList authorization response.'));
        return;
      }

      clearTimeout(timeout);
      sendCallbackPage(
        res,
        'MyAnimeList login complete',
        'You can close this tab and return to Seenary.'
      );
      stopActiveServer();
      resolve(code);
    });

    server.once('error', (error) => {
      clearTimeout(timeout);
      activeServer = null;

      if (error.code === 'EADDRINUSE') {
        reject(new Error('The MyAnimeList callback port is already in use.'));
        return;
      }

      reject(error);
    });

    server.listen(CALLBACK_PORT, '127.0.0.1', async () => {
      activeServer = server;

      try {
        await shell.openExternal(buildAuthorizeUrl(state, codeVerifier));
      } catch (error) {
        clearTimeout(timeout);
        stopActiveServer();
        reject(error);
      }
    });
  });
}

async function authorizeWithBrowser() {
  const state = crypto.randomBytes(24).toString('hex');
  const codeVerifier = createCodeVerifier();
  const code = await waitForAuthorizationCode(state, codeVerifier);
  return await mal.exchangeCodeForToken({
    code,
    codeVerifier,
    redirectUri: REDIRECT_URI,
  });
}

module.exports = {
  authorizeWithBrowser,
  REDIRECT_URI,
};
