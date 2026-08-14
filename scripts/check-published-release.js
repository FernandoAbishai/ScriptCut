#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { formatPublicArtifactFilename } = require('./release-identity');
const { normalizeLineEndings } = require('./release-notes');

const root = path.join(__dirname, '..');
const CLOSURE_SCHEMA = 'scriptcut.release-closure.v1';
const PUBLIC_ASSET_COUNT = 6;

function fail(message) {
  throw new Error(`Published release verification failed: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`could not read ${label}: ${error.message}`);
  }
}

function runGh(args) {
  const result = spawnSync('gh', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) {
    fail(`gh ${args.join(' ')} failed: ${(result.error?.message || result.stderr || result.stdout || '').trim()}`);
  }
  return result.stdout;
}

function ghApi(repo, endpoint) {
  return JSON.parse(runGh(['api', `repos/${repo}/${endpoint}`]));
}

function liveApi() {
  return {
    getTagRef: (repo, tag) => ghApi(repo, `git/ref/tags/${encodeURIComponent(tag)}`),
    getAnnotatedTag: (repo, sha) => ghApi(repo, `git/tags/${sha}`),
    getRelease: (repo, tag) => ghApi(repo, `releases/tags/${encodeURIComponent(tag)}`),
  };
}

function resolveTagCommit(api, repo, tag) {
  const ref = api.getTagRef(repo, tag);
  assert(ref?.object?.sha && ref.object.type, 'tag reference is missing its object');
  if (ref.object.type === 'commit') return ref.object.sha;
  if (ref.object.type !== 'tag') fail(`unexpected tag object type: ${ref.object.type}`);
  const annotated = api.getAnnotatedTag(repo, ref.object.sha);
  assert(annotated?.object?.sha && annotated.object.type, 'annotated tag target is missing its object');
  if (annotated.object.type !== 'commit') fail(`annotated tag target is not a commit: ${annotated.object.type}`);
  return annotated.object.sha;
}

function expectedAssetNames(manifest) {
  return [
    manifest.artifact.filename,
    'SHA256SUMS.txt',
    'release-manifest.json',
    'RELEASE_NOTES.md',
    `${manifest.artifact.filename}.sigstore.json`,
    'release-manifest.sigstore.json',
  ];
}

async function checksumFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath, { highWaterMark: 1024 * 1024 });
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function readLocalBundle(directory, tag) {
  const manifestPath = path.join(directory, 'release-manifest.json');
  const notesPath = path.join(directory, 'RELEASE_NOTES.md');
  const manifest = readJson(manifestPath, 'release-manifest.json');
  assert(manifest.schema === 'scriptcut.release.v2', 'local release manifest schema must remain scriptcut.release.v2');
  assert(manifest.releaseTag === tag, 'local release manifest tag does not match requested tag');
  assert(typeof manifest.artifact?.filename === 'string', 'local release manifest artifact filename is missing');
  assert(manifest.artifact.filename === formatPublicArtifactFilename(tag, manifest.version, 'arm64'), 'local DMG filename does not match the release tag');
  assert(/^[0-9a-f]{64}$/.test(manifest.artifact.sha256), 'local release manifest artifact SHA-256 is missing');

  const expectedNames = expectedAssetNames(manifest);
  const actualNames = fs.readdirSync(directory).filter((name) => fs.statSync(path.join(directory, name)).isFile()).sort();
  assert(actualNames.length === PUBLIC_ASSET_COUNT && expectedNames.every((name) => actualNames.includes(name)), 'local public bundle is not the exact six-file payload');

  const files = {};
  const digests = {};
  for (const name of expectedNames) {
    const filePath = path.join(directory, name);
    assert(fs.existsSync(filePath), `local public asset is missing: ${name}`);
    files[name] = filePath;
    digests[name] = await checksumFile(filePath);
  }
  assert(digests[manifest.artifact.filename] === manifest.artifact.sha256, 'local DMG digest does not match release-manifest artifact SHA-256');
  const sums = fs.readFileSync(files['SHA256SUMS.txt'], 'utf8');
  assert(sums === `${manifest.artifact.sha256}  ${manifest.artifact.filename}\n`, 'local SHA256SUMS.txt does not match the manifest');
  return { manifest, notes: fs.readFileSync(notesPath, 'utf8'), expectedNames, files, digests };
}

function releaseFields(release) {
  return {
    id: release.id,
    url: release.html_url || release.url,
    tag: release.tag_name || release.tagName,
    draft: release.draft ?? release.isDraft,
    prerelease: release.prerelease ?? release.isPrerelease,
    title: release.name || release.title,
    body: release.body,
    targetCommit: release.target_commitish ?? release.targetCommitish,
    assets: release.assets || [],
  };
}

function verifyReleaseMetadata(releaseJson, { repo, tag, commit, expectedNames, digests, notes, manifest }) {
  const release = releaseFields(releaseJson);
  assert(release.tag === tag, 'GitHub Release tag does not match requested release tag');
  assert(release.draft === false, 'GitHub Release must not be a draft');
  assert(release.prerelease === true, 'GitHub Release must be a prerelease');
  assert(release.title === `ScriptCut ${tag}`, 'GitHub Release title is incorrect');
  if (release.targetCommit) assert(release.targetCommit === commit, 'GitHub Release target does not match expected commit');
  assert(typeof release.body === 'string', 'GitHub Release body is missing');
  assert(normalizeLineEndings(release.body) === normalizeLineEndings(notes), 'GitHub Release body does not match local RELEASE_NOTES.md');
  assert(Array.isArray(release.assets) && release.assets.length === PUBLIC_ASSET_COUNT, 'GitHub Release does not have exactly six assets');

  const names = release.assets.map((asset) => asset.name);
  assert(new Set(names).size === names.length, 'GitHub Release contains duplicate asset names');
  assert(names.every((name) => expectedNames.includes(name)) && expectedNames.every((name) => names.includes(name)), 'GitHub Release asset set is not exact');

  const remoteDigests = {};
  for (const asset of release.assets) {
    assert(typeof asset.digest === 'string' && /^sha256:[0-9a-f]{64}$/.test(asset.digest), `GitHub asset digest is missing or invalid: ${asset.name}`);
    const digest = asset.digest.slice('sha256:'.length);
    remoteDigests[asset.name] = digest;
    assert(digest === digests[asset.name], `GitHub asset digest does not match local file: ${asset.name}`);
  }
  assert(remoteDigests[manifest.artifact.filename] === manifest.artifact.sha256, 'GitHub DMG digest does not match release-manifest artifact SHA-256');
  return { release, remoteDigests };
}

function validateQualification(status, reference) {
  const normalizedReference = typeof reference === 'string' ? reference.trim() : '';
  if (status === undefined || status === null || status === '') {
    assert(!normalizedReference, 'qualification reference requires a creator qualification status');
    return { status: null, reference: null };
  }
  assert(status === 'NOT_REQUIRED' || status === 'PASSED_PHYSICAL_MAC', `invalid creator qualification: ${status}`);
  if (status === 'PASSED_PHYSICAL_MAC') {
    assert(normalizedReference, 'PASSED_PHYSICAL_MAC requires a qualification reference');
    assert(!/[\r\n]/.test(normalizedReference), 'qualification reference must be a single line');
    assert(!/^[/~]|^[A-Za-z]:[\\/]/.test(normalizedReference), 'qualification reference must not be a local filesystem path');
    assert(!/(^|[/\\])(?:Users|private|var[/\\]folders|runner_temp)([/\\]|$)/i.test(normalizedReference), 'qualification reference must not leak a private runner path');
  }
  return { status, reference: normalizedReference || null };
}

async function verifyPublishedRelease({
  repo,
  tag,
  commit,
  dir,
  output,
  api = liveApi(),
  workflow = null,
  runId = null,
  runAttempt = null,
  creatorQualification,
  qualificationReference,
  verifiedAt = new Date().toISOString(),
} = {}) {
  assert(typeof repo === 'string' && repo.includes('/'), 'repo is required');
  assert(typeof tag === 'string' && tag, 'tag is required');
  assert(typeof commit === 'string' && /^[0-9a-f]{40}$/.test(commit), 'commit must be a full SHA-1');
  const directory = path.resolve(dir || path.join(root, 'dist', 'public-release'));
  const local = await readLocalBundle(directory, tag);
  const tagCommit = resolveTagCommit(api, repo, tag);
  assert(tagCommit === commit, 'GitHub tag does not resolve to expected commit');
  const releaseJson = api.getRelease(repo, tag);
  const published = verifyReleaseMetadata(releaseJson, {
    repo,
    tag,
    commit,
    expectedNames: local.expectedNames,
    digests: local.digests,
    notes: local.notes,
    manifest: local.manifest,
  });
  const qualification = validateQualification(creatorQualification, qualificationReference);
  const closure = {
    schema: CLOSURE_SCHEMA,
    repository: repo,
    releaseTag: tag,
    commit,
    workflow,
    runId,
    runAttempt,
    verifiedAt,
    creatorQualification: qualification,
    release: {
      id: published.release.id,
      url: published.release.url,
      draft: published.release.draft,
      prerelease: published.release.prerelease,
      title: published.release.title,
      targetCommit: published.release.targetCommit || null,
    },
    verification: {
      tagCommit,
      releaseState: true,
      exactAssets: true,
      assetDigests: published.remoteDigests,
      releaseNotes: true,
    },
    artifact: {
      filename: local.manifest.artifact.filename,
      sha256: local.manifest.artifact.sha256,
      bytes: local.manifest.artifact.bytes,
    },
  };
  if (output) {
    fs.writeFileSync(path.resolve(output), `${JSON.stringify(closure, null, 2)}\n`, 'utf8');
  }
  return closure;
}

async function main() {
  const creatorQualification = optionValue('--creator-qualification');
  const qualificationReference = optionValue('--qualification-reference');
  if (process.argv.includes('--validate-qualification')) {
    validateQualification(creatorQualification, qualificationReference);
    console.log('Creator qualification declaration is valid.');
    return;
  }
  const closure = await verifyPublishedRelease({
    repo: optionValue('--repo') || process.env.GITHUB_REPOSITORY,
    tag: optionValue('--tag'),
    commit: optionValue('--commit') || process.env.GITHUB_SHA,
    dir: optionValue('--dir'),
    output: optionValue('--output'),
    workflow: optionValue('--workflow') || process.env.GITHUB_WORKFLOW || null,
    runId: optionValue('--run-id') || process.env.GITHUB_RUN_ID || null,
    runAttempt: optionValue('--run-attempt') || process.env.GITHUB_RUN_ATTEMPT || null,
    creatorQualification,
    qualificationReference,
  });
  console.log(`Published release verified: ${closure.releaseTag} -> ${closure.commit}`);
  console.log(`DMG SHA-256: ${closure.artifact.sha256}`);
  if (optionValue('--output')) console.log(`Closure evidence: ${path.resolve(optionValue('--output'))}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  CLOSURE_SCHEMA,
  PUBLIC_ASSET_COUNT,
  resolveTagCommit,
  validateQualification,
  verifyPublishedRelease,
};
