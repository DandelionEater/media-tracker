const fs = require('fs');
const path = require('path');
const { app, net, protocol } = require('electron');
const { pathToFileURL } = require('url');

const SEENARY_WEB_ORIGIN = 'https://web.seenary.app';

function shouldUseBundledFrontend() {
  if (process.env.SEENARY_USE_BUNDLED_FRONTEND === '1') {
    return true;
  }

  try {
    return require('./package.json').seenaryBundledFrontend === true;
  } catch {
    return false;
  }
}

function getBundledFrontendRoot() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'frontend-dist')
    : path.resolve(__dirname, '..', 'frontend', 'dist');
}

function isPathInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function resolveFrontendFile(frontendRoot, requestUrl) {
  const url = new URL(requestUrl);
  let pathname;

  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return { errorStatus: 400 };
  }

  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const candidate = path.resolve(frontendRoot, relativePath);

  if (!isPathInside(frontendRoot, candidate)) {
    return { errorStatus: 400 };
  }

  try {
    if ((await fs.promises.stat(candidate)).isFile()) {
      return { filePath: candidate };
    }
  } catch {
    // Client-side routes fall back to index.html below.
  }

  if (path.extname(relativePath)) {
    return { errorStatus: 404 };
  }

  return { filePath: path.join(frontendRoot, 'index.html') };
}

async function serveBundledFrontend(request, frontendRoot) {
  const resolved = await resolveFrontendFile(frontendRoot, request.url);

  if (resolved.errorStatus) {
    return new Response(resolved.errorStatus === 404 ? 'Not found' : 'Bad request', {
      status: resolved.errorStatus,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const fileResponse = await net.fetch(pathToFileURL(resolved.filePath).toString());
  const headers = new Headers(fileResponse.headers);
  headers.set('cache-control', 'no-store');
  headers.set('x-seenary-frontend-source', 'bundled-test');

  return new Response(request.method === 'HEAD' ? null : fileResponse.body, {
    status: fileResponse.status,
    statusText: fileResponse.statusText,
    headers,
  });
}

async function setupBundledFrontend() {
  if (!shouldUseBundledFrontend()) {
    return { enabled: false, origin: SEENARY_WEB_ORIGIN };
  }

  const frontendRoot = getBundledFrontendRoot();
  const indexPath = path.join(frontendRoot, 'index.html');

  if (!fs.existsSync(indexPath)) {
    throw new Error(`Bundled Seenary frontend is missing: ${indexPath}`);
  }

  await protocol.handle('https', (request) => {
    const url = new URL(request.url);

    if (
      url.origin === SEENARY_WEB_ORIGIN &&
      (request.method === 'GET' || request.method === 'HEAD')
    ) {
      return serveBundledFrontend(request, frontendRoot);
    }

    return net.fetch(request, { bypassCustomProtocolHandlers: true });
  });

  return {
    enabled: true,
    origin: SEENARY_WEB_ORIGIN,
    frontendRoot,
  };
}

module.exports = {
  SEENARY_WEB_ORIGIN,
  resolveFrontendFile,
  setupBundledFrontend,
  shouldUseBundledFrontend,
};
