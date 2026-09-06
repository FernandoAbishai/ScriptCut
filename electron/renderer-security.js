const path = require('path');
const { pathToFileURL } = require('url');

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
  isTrustedRendererUrl,
  packagedRendererUrl,
};
