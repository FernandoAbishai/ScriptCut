#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createAtomicTextWriteQueue, writeTextFileAtomic } = require('../electron/project-file-io');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'scriptcut-project-write-'));
const projectPath = path.join(directory, 'creator.scriptcut');

async function main() {
  fs.writeFileSync(projectPath, 'old project\n', { encoding: 'utf8', mode: 0o600 });
  writeTextFileAtomic(projectPath, 'new project\n');

  assert.equal(fs.readFileSync(projectPath, 'utf8'), 'new project\n');
  assert.deepEqual(
    fs.readdirSync(directory).sort(),
    ['creator.scriptcut'],
    'atomic project write left a temporary file behind',
  );
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(projectPath).mode & 0o777, 0o600, 'project file permissions are not owner-only');
  }

  const queuedWrite = createAtomicTextWriteQueue();
  const first = queuedWrite(projectPath, 'queued first\n');
  const second = queuedWrite(projectPath, 'queued latest\n');
  await Promise.all([first, second]);
  assert.equal(fs.readFileSync(projectPath, 'utf8'), 'queued latest\n', 'queued project writes completed out of order');

  console.log('Atomic project-file write smoke passed.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
}).finally(() => {
  fs.rmSync(directory, { recursive: true, force: true });
});
