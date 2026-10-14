const path = require('path');
const { pathToFileURL } = require('url');

const ALLOWED_EXTERNAL_ORIGINS = new Set([
  'https://github.com',
  'https://www.python.org',
]);
const ALLOWED_RENDERER_PERMISSIONS = new Set(['clipboard-sanitized-write']);

function packagedRendererUrl(projectRoot) {
  return pathToFileURL(path.join(projectRoot, 'frontend', 'dist', 'index.html')).href;
}

function normalizedDocumentUrl(value) {
  try {
    const parsed = new URL(value);
    parsed.hash = '';
    parsed.search = '';
    return parsed.href;
  } catch {
    return '';
  }
}

function isTrustedRendererUrl(url, { isDev, packagedUrl }) {
  if (isDev) return normalizedDocumentUrl(url) === 'http://localhost:5173/';
  return normalizedDocumentUrl(url) === normalizedDocumentUrl(packagedUrl);
}

function isAllowedExternalUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ALLOWED_EXTERNAL_ORIGINS.has(url.origin);
  } catch {
    return false;
  }
}

function isTrustedRendererWebContents(webContents, window, policy) {
  return Boolean(
    window
    && webContents
    && webContents === window.webContents
    && webContents.mainFrame
    && isTrustedRendererUrl(webContents.mainFrame.url || '', policy)
  );
}

function isAllowedRendererPermission(webContents, permission, details, window, policy) {
  return ALLOWED_RENDERER_PERMISSIONS.has(permission)
    && isTrustedRendererWebContents(webContents, window, policy)
    && details?.isMainFrame === true
    && isTrustedRendererUrl(details?.requestingUrl || '', policy);
}

function assertTrustedIpcSender(event, window, policy) {
  if (!window || event.sender !== window.webContents) {
    throw new Error('IPC request did not come from the ScriptCut window.');
  }
  if (!event.senderFrame || event.senderFrame !== window.webContents.mainFrame) {
    throw new Error('IPC requests are only accepted from the ScriptCut main frame.');
  }
  if (!isTrustedRendererUrl(event.senderFrame.url || '', policy)) {
    throw new Error('IPC request came from an untrusted document.');
  }
}

module.exports = {
  assertTrustedIpcSender,
  isAllowedExternalUrl,
  isAllowedRendererPermission,
  isTrustedRendererUrl,
  isTrustedRendererWebContents,
  packagedRendererUrl,
};
