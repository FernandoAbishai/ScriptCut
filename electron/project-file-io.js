const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function syncDirectory(directory) {
  let directoryFd = null;
  try {
    directoryFd = fs.openSync(directory, 'r');
    fs.fsyncSync(directoryFd);
  } catch {
    // Directory fsync is not supported by every platform/filesystem. The file
    // itself has already been fsynced before rename, so keep the atomic write.
  } finally {
    if (directoryFd !== null) fs.closeSync(directoryFd);
  }
}

function writeTextFileAtomic(filePath, content, { mode = 0o600 } = {}) {
  const targetPath = path.resolve(filePath);
  const directory = path.dirname(targetPath);
  const temporaryPath = path.join(
    directory,
    `.${path.basename(targetPath)}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`,
  );

  let fileFd = null;
  try {
    fileFd = fs.openSync(temporaryPath, 'wx', mode);
    fs.writeFileSync(fileFd, content, { encoding: 'utf8' });
    fs.fsyncSync(fileFd);
    fs.closeSync(fileFd);
    fileFd = null;
    fs.renameSync(temporaryPath, targetPath);
    syncDirectory(directory);
  } catch (error) {
    if (fileFd !== null) {
      try {
        fs.closeSync(fileFd);
      } catch {
        // Preserve the original write failure.
      }
    }
    try {
      fs.unlinkSync(temporaryPath);
    } catch {
      // The temp file may already have been renamed or never created.
    }
    throw error;
  }
}

function createAtomicTextWriteQueue() {
  const pendingByPath = new Map();

  return (filePath, content, options) => {
    const key = path.resolve(filePath);
    const previous = pendingByPath.get(key) || Promise.resolve();
    const operation = previous
      .catch(() => undefined)
      .then(() => writeTextFileAtomic(key, content, options));
    pendingByPath.set(key, operation);
    return operation.finally(() => {
      if (pendingByPath.get(key) === operation) pendingByPath.delete(key);
    });
  };
}

module.exports = { createAtomicTextWriteQueue, writeTextFileAtomic };
