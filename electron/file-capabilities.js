const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SERVABLE_MEDIA_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.mov', '.avi', '.webm',
  '.m4a', '.wav', '.mp3', '.flac',
]);

function canonicalReadableMediaPath(filePath) {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw new Error('Media path is required.');
  }
  const resolved = fs.realpathSync(filePath);
  if (!fs.statSync(resolved).isFile()) throw new Error('Media path is not a file.');
  if (!SERVABLE_MEDIA_EXTENSIONS.has(path.extname(resolved).toLowerCase())) {
    throw new Error('Only supported ScriptCut media files can receive a local read capability.');
  }
  return resolved;
}

function signFileCapability(filePath, secret) {
  if (!secret) throw new Error('Local file capability authority is unavailable.');
  return crypto.createHmac('sha256', secret).update(filePath, 'utf8').digest('hex');
}

class MediaReadAllowlist {
  constructor() {
    this.paths = new Set();
  }

  approve(filePath) {
    const resolved = canonicalReadableMediaPath(filePath);
    this.paths.add(resolved);
    return resolved;
  }

  tryApprove(filePath) {
    try {
      return this.approve(filePath);
    } catch {
      return null;
    }
  }

  createUrl(origin, filePath, secret) {
    const resolved = canonicalReadableMediaPath(filePath);
    if (!this.paths.has(resolved)) {
      throw new Error('This media file has not been approved for the current ScriptCut session.');
    }
    const capability = signFileCapability(resolved, secret);
    return `${origin}/file?path=${encodeURIComponent(resolved)}&cap=${encodeURIComponent(capability)}`;
  }
}

module.exports = {
  MediaReadAllowlist,
  SERVABLE_MEDIA_EXTENSIONS,
  canonicalReadableMediaPath,
  signFileCapability,
};
