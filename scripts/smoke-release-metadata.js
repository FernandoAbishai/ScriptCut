#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { checksumFile } = require('./release-alpha');

const root = path.join(__dirname, '..');

function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(message) {
  throw new Error(`Release metadata smoke failed: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function walkValues(value, visit) {
  if (typeof value === 'string') visit(value);
  else if (Array.isArray(value)) value.forEach((entry) => walkValues(entry, visit));
  else if (value && typeof value === 'object') Object.values(value).forEach((entry) => walkValues(entry, visit));
}

async function testStreamingChecksum() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scriptcut-release-hash-'));
  try {
    const fixtures = [
      ['small.bin', Buffer.from('ScriptCut streaming checksum fixture\n')],
      ['multi-chunk.bin', Buffer.alloc(3 * 1024 * 1024 + 17, 0x5a)],
    ];
    for (const [name, content] of fixtures) {
      const fixturePath = path.join(fixtureRoot, name);
      fs.writeFileSync(fixturePath, content);
      const expected = crypto.createHash('sha256').update(content).digest('hex');
      const actual = await checksumFile(fixturePath);
      assert(actual === expected, `streaming checksum mismatch for ${name}`);
    }
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

async function main() {
  const releaseDir = path.resolve(optionValue('--dir') || path.join(root, 'dist', 'release-candidate'));
  const manifestPath = path.join(releaseDir, 'release-manifest.json');
  const checksumPath = path.join(releaseDir, 'SHA256SUMS.txt');
  const notesPath = path.join(releaseDir, 'RELEASE_NOTES.md');
  for (const filePath of [manifestPath, checksumPath, notesPath]) assert(fs.existsSync(filePath), `missing ${path.relative(root, filePath)}`);

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const notes = fs.readFileSync(notesPath, 'utf8');
  assert(manifest.schema === 'scriptcut.release.v1', 'schema must be scriptcut.release.v1');
  assert(manifest.platform === 'darwin' && manifest.architecture === 'arm64', 'release target must be darwin arm64');
  assert(/^[0-9a-f]{40}$/.test(manifest.commit), 'commit must be a full SHA-1');
  assert(manifest.tagCandidate === null && manifest.tagExists === false, 'metadata must not pretend a tag exists');
  assert(manifest.signed === false && manifest.notarized === false, 'candidate trust state must be false');
  assert(manifest.codeSignature?.type === 'ad-hoc' && manifest.codeSignature?.structurallyValid === true, 'candidate ad-hoc signature metadata is missing');
  assert(manifest.codeSignature?.hardenedRuntime === false, 'candidate metadata must record Hardened Runtime disabled');
  assert(manifest.model?.embedded === false, 'modelEmbedded must be false');
  assert(manifest.runtime?.mode === 'packaged-bundled', 'runtime mode must be packaged-bundled');
  assert(manifest.runtime?.pythonSource === 'bundled', 'Python source must be bundled');
  assert(manifest.runtime?.target?.platform === 'darwin' && manifest.runtime?.target?.arch === 'arm64', 'runtime target must be darwin-arm64');
  assert(manifest.artifact?.filename && path.basename(manifest.artifact.filename) === manifest.artifact.filename, 'artifact filename must be relative');
  assert(Number.isInteger(manifest.artifact.bytes) && manifest.artifact.bytes > 0, 'artifact bytes must be present');
  assert(/^[0-9a-f]{64}$/.test(manifest.artifact.sha256), 'artifact SHA-256 must be present');
  for (const field of [manifest.runtime.manifestSha256, manifest.coreInventorySha256, manifest.ffmpeg.manifestSha256, manifest.model.manifestSha256]) {
    assert(/^[0-9a-f]{64}$/.test(field), 'provenance SHA-256 must be present');
  }
  walkValues(manifest, (value) => {
    assert(!/^\//.test(value) && !/^[A-Za-z]:[\\/]/.test(value), `absolute path in metadata: ${value}`);
    assert(!/(CSC_KEY_PASSWORD|APPLE_APP_SPECIFIC_PASSWORD|BEGIN [A-Z ]*PRIVATE KEY|api[_ -]?key)/i.test(value), 'secret-like metadata value found');
  });
  assert(/Creators do not need to install Python, run pip, download FFmpeg, configure PATH, or create a virtual environment/i.test(notes), 'release notes omit the self-contained setup statement');
  assert(!/^\s*(?:before|first|to use|run|install|configure|create)\b.*(?:Python|pip|FFmpeg|PATH|virtual environment)/im.test(notes), 'release notes contain positive developer setup instructions');
  assert(/first transcription/i.test(notes) && /without model-network access/i.test(notes), 'release notes omit first-use model behavior');
  assert(/internal release candidate/i.test(notes) && /not for public distribution/i.test(notes), 'release notes omit candidate-only trust wording');
  assert(/ad-hoc structural signature/i.test(notes) && /not signed with Apple Developer ID/i.test(notes), 'release notes omit ad-hoc trust wording');

  const artifactPath = path.join(releaseDir, manifest.artifact.filename);
  assert(fs.existsSync(artifactPath), 'manifest artifact is missing from release directory');
  assert(fs.statSync(artifactPath).size === manifest.artifact.bytes, 'manifest artifact bytes do not match');
  assert(await checksumFile(artifactPath) === manifest.artifact.sha256, 'manifest artifact hash does not match');
  const checksumLine = fs.readFileSync(checksumPath, 'utf8').trim().split(/\s+/);
  assert(checksumLine[0] === manifest.artifact.sha256 && checksumLine[1] === manifest.artifact.filename, 'SHA256SUMS does not match manifest');

  await testStreamingChecksum();
  console.log('Release metadata schema, provenance, path safety, notes, artifact checksum, and streaming checksum tests passed.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
