#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { checksumFile } = require('./release-alpha');

const root = path.join(__dirname, '..');
const forbiddenNames = new Set([
  'base.pt', '.venv', '.venv311', 'runtime-cache', 'pip-cache', 'whisperx', 'nemo',
  'pyannote', 'df', 'deepfilternet', 'mediapipe', 'cv2', 'openai', 'anthropic', 'moviepy',
]);

function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(message) {
  throw new Error(`Public release check failed: ${message}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: options.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) {
    fail(`${command} ${args.join(' ')} failed: ${(result.error?.message || result.stderr || result.stdout || '').trim()}`);
  }
  return result;
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function walkValues(value, visit) {
  if (typeof value === 'string') visit(value);
  else if (Array.isArray(value)) value.forEach((entry) => walkValues(entry, visit));
  else if (value && typeof value === 'object') Object.values(value).forEach((entry) => walkValues(entry, visit));
}

function findForbidden(directory, found = []) {
  if (!fs.existsSync(directory)) return found;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (forbiddenNames.has(entry.name.toLowerCase())) found.push(path.relative(directory, entryPath));
    if (entry.isDirectory()) findForbidden(entryPath, found);
  }
  return found;
}

function validateNotes(notes) {
  const required = [
    /macOS Apple Silicon/i,
    /self-contained/i,
    /first transcription/i,
    /not signed with Apple Developer ID/i,
    /not notarized by Apple/i,
    /Privacy & Security/i,
    /Open Anyway/i,
    /shasum -a 256 -c SHA256SUMS\.txt/i,
    /gh attestation verify/i,
    /prerelease alpha/i,
  ];
  required.forEach((pattern) => assert(pattern.test(notes), `release notes omit ${pattern}`));
  assert(!/^\s*(?:install|run|create|brew|sudo|xattr|spctl --master-disable)\b.*(?:Python|pip|FFmpeg|venv|Gatekeeper|quarantine)/im.test(notes), 'release notes contain prohibited creator bypass/setup instructions');
}

function validateManifest(manifest, { allowPendingAttestation = false } = {}) {
  assert(manifest.schema === 'scriptcut.release.v2', 'schema must be scriptcut.release.v2');
  assert(/^v\d+\.\d+\.\d+-alpha\.[1-9]\d*$/.test(manifest.releaseTag), 'release tag format is invalid');
  assert(manifest.prerelease === true && manifest.channel === 'public-unsigned-alpha', 'public prerelease semantics are missing');
  assert(manifest.platform === 'darwin' && manifest.architecture === 'arm64', 'public target must be darwin arm64');
  assert(manifest.distribution?.mode === 'unsigned-public-alpha', 'distribution mode is not unsigned-public-alpha');
  assert(manifest.distribution.appleDeveloperIdSigned === false, 'Apple signing truth must be false');
  assert(manifest.distribution.appleNotarized === false, 'Apple notarization truth must be false');
  assert(manifest.distribution.gatekeeperTrusted === false, 'Gatekeeper truth must be false');
  assert(manifest.distribution.firstLaunchApprovalRequired === true, 'first-launch approval truth must be true');
  assert(manifest.runtime?.mode === 'packaged-bundled' && manifest.runtime?.pythonSource === 'bundled', 'runtime must be packaged-bundled');
  assert(manifest.runtime?.target?.platform === 'darwin' && manifest.runtime?.target?.arch === 'arm64', 'runtime target must be darwin arm64');
  assert(manifest.model?.embedded === false, 'model weights must not be embedded');
  assert(/^[0-9a-f]{40}$/.test(manifest.commit), 'manifest commit must be a full SHA-1');
  assert(/^[0-9a-f]{64}$/.test(manifest.artifact?.sha256), 'artifact SHA-256 is missing');
  assert(Number.isInteger(manifest.artifact?.bytes) && manifest.artifact.bytes > 0, 'artifact byte count is missing');
  assert(manifest.artifact.filename === `ScriptCut-${manifest.releaseTag}-arm64.dmg`, 'public artifact filename must include the release tag');
  assert(manifest.provenance?.provider === 'github-artifact-attestation-sigstore', 'provenance provider is incorrect');
  assert(manifest.provenance.repository === 'FernandoAbishai/ScriptCut', 'provenance repository is incorrect');
  assert(manifest.provenance.workflow === '.github/workflows/release-unsigned.yml', 'provenance workflow is incorrect');
  if (!allowPendingAttestation) {
    assert(manifest.provenance.dmgAttestation?.url, 'DMG attestation URL is missing');
    assert(manifest.provenance.dmgAttestation?.id, 'DMG attestation ID is missing');
  }
  walkValues(manifest, (value) => {
    assert(!/^\//.test(value) && !/^[A-Za-z]:[\\/]/.test(value), `absolute path in manifest: ${value}`);
    assert(!/(^|[/\\])Users[/\\]|runner_temp|private[/\\]var|CSC_KEY_PASSWORD|APPLE_APP_SPECIFIC_PASSWORD|BEGIN [A-Z ]*PRIVATE KEY/i.test(value), 'local path or secret-like value in manifest');
  });
}

function mountedApp(dmgPath, callback) {
  const mountPoint = fs.mkdtempSync(path.join(os.tmpdir(), 'scriptcut-public-dmg-'));
  try {
    run('hdiutil', ['verify', dmgPath]);
    run('hdiutil', ['attach', dmgPath, '-readonly', '-nobrowse', '-mountpoint', mountPoint]);
    const appName = fs.readdirSync(mountPoint).find((name) => name.endsWith('.app'));
    assert(appName === 'ScriptCut.app', 'DMG does not contain ScriptCut.app at its root');
    return callback(path.join(mountPoint, appName));
  } finally {
    spawnSync('hdiutil', ['detach', mountPoint, '-force'], { cwd: root, encoding: 'utf8', stdio: 'ignore' });
    fs.rmSync(mountPoint, { recursive: true, force: true });
  }
}

async function checkBundle(directory, dmgPath, { allowPendingAttestation = false } = {}) {
  const manifestPath = path.join(directory, 'release-manifest.json');
  const sumsPath = path.join(directory, 'SHA256SUMS.txt');
  const notesPath = path.join(directory, 'RELEASE_NOTES.md');
  for (const filePath of [manifestPath, sumsPath, notesPath, dmgPath]) assert(fs.existsSync(filePath), `missing ${path.relative(root, filePath)}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  validateManifest(manifest, { allowPendingAttestation });
  const notes = fs.readFileSync(notesPath, 'utf8');
  validateNotes(notes);
  const actualHash = await checksumFile(dmgPath);
  assert(actualHash === manifest.artifact.sha256, 'DMG SHA-256 does not match public manifest');
  assert(fs.statSync(dmgPath).size === manifest.artifact.bytes, 'DMG bytes do not match public manifest');
  const sumLine = fs.readFileSync(sumsPath, 'utf8').trim().split(/\s+/);
  assert(sumLine[0] === actualHash && sumLine[1] === manifest.artifact.filename, 'SHA256SUMS does not match final public filename');
  assert(path.basename(dmgPath) === manifest.artifact.filename, 'checked DMG path is not the final public filename');

  mountedApp(dmgPath, (appPath) => {
    const resources = path.join(appPath, 'Contents', 'Resources');
    const required = [
      'backend',
      'runtime',
      'manifests/runtime-manifest.json',
      'manifests/model-manifest.json',
      'bin/darwin-arm64/ffmpeg',
      'bin/darwin-arm64/ffprobe',
      'LICENSE',
      'THIRD_PARTY_NOTICES.md',
      'ACKNOWLEDGEMENTS.md',
      'LICENSES/CutScript-MIT.txt',
    ];
    required.forEach((relative) => assert(fs.existsSync(path.join(resources, relative)), `missing packaged resource ${relative}`));
    const forbidden = findForbidden(resources);
    assert(forbidden.length === 0, `forbidden packaged resource: ${forbidden.join(', ')}`);
  });
  console.log(`Public DMG verified: ${manifest.releaseTag}, ${manifest.artifact.bytes} bytes, ${actualHash}`);
  console.log('Self-contained resources, model exclusion, checksum, notes, and unsigned truth passed.');
  return manifest;
}

function checkPublishedRelease(releaseJsonPath, manifest, publicDir) {
  const release = JSON.parse(fs.readFileSync(releaseJsonPath, 'utf8'));
  assert(release.tagName === manifest.releaseTag || release.tag_name === manifest.releaseTag, 'published release tag does not match manifest');
  assert((release.isDraft ?? release.draft) === false, 'published release must not be a draft');
  assert((release.isPrerelease ?? release.prerelease) === true, 'published release must be a prerelease');
  const assets = release.assets || [];
  const expected = [
    manifest.artifact.filename,
    'SHA256SUMS.txt',
    'release-manifest.json',
    `${manifest.artifact.filename}.sigstore.json`,
    'release-manifest.sigstore.json',
    'RELEASE_NOTES.md',
  ];
  assert(assets.length === expected.length && expected.every((name) => assets.filter((asset) => asset.name === name).length === 1), 'published asset set is not exact');
  const dmgAsset = assets.find((asset) => asset.name === manifest.artifact.filename);
  if (dmgAsset.digest) assert(dmgAsset.digest === `sha256:${manifest.artifact.sha256}`, 'GitHub DMG asset digest does not match local SHA-256');
  assert(fs.existsSync(path.join(publicDir, manifest.artifact.filename)), 'published verification DMG is missing locally');
}

async function main() {
  const releaseJsonPath = optionValue('--release-json');
  if (releaseJsonPath) {
    const directory = path.resolve(optionValue('--dir') || path.join(root, 'dist', 'public-release'));
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'release-manifest.json'), 'utf8'));
    checkPublishedRelease(path.resolve(releaseJsonPath), manifest, directory);
    console.log('Published release metadata and asset set passed.');
    return;
  }
  const directory = path.resolve(optionValue('--dir') || path.join(root, 'dist', 'public-release'));
  const manifestPath = path.join(directory, 'release-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const dmgPath = path.resolve(optionValue('--dmg') || path.join(directory, manifest.artifact.filename));
  await checkBundle(directory, dmgPath, { allowPendingAttestation: process.argv.includes('--allow-pending-attestation') });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = { checkBundle, checkPublishedRelease, validateManifest, validateNotes };
