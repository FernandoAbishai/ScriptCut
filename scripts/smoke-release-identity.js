#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {
  formatAlphaReleaseTag,
  formatCandidateArtifactFilename,
  formatPublicArtifactFilename,
  parseAlphaReleaseTag,
  readProductVersion,
  validateAlphaReleaseTag,
} = require('./release-identity');

const root = path.join(__dirname, '..');

function fail(message) {
  throw new Error(`Release identity smoke failed: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function expectFailure(callback, label) {
  try {
    callback();
  } catch (_error) {
    return;
  }
  fail(`${label} was accepted`);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function lockRootVersion(relativePath) {
  const lock = readJson(relativePath);
  return lock.packages?.['']?.version || lock.version;
}

function main() {
  const productVersion = readProductVersion();
  assert(productVersion === '0.1.0', 'current productVersion must remain 0.1.0');
  assert(readJson('frontend/package.json').version === productVersion, 'frontend package version drifted from productVersion');
  assert(lockRootVersion('package-lock.json') === productVersion, 'root lockfile metadata drifted from productVersion');
  assert(lockRootVersion('frontend/package-lock.json') === productVersion, 'frontend lockfile metadata drifted from productVersion');

  const rendererSource = fs.readFileSync(path.join(root, 'frontend', 'src', 'utils', 'releaseInfo.ts'), 'utf8');
  const settingsSource = fs.readFileSync(path.join(root, 'frontend', 'src', 'components', 'SettingsPanel.tsx'), 'utf8');
  const homeSource = fs.readFileSync(path.join(root, 'frontend', 'src', 'components', 'HomeScreen.tsx'), 'utf8');
  const viteSource = fs.readFileSync(path.join(root, 'frontend', 'vite.config.ts'), 'utf8');
  assert(/SCRIPTCUT_PRODUCT_VERSION\s*=\s*__SCRIPTCUT_PRODUCT_VERSION__/.test(rendererSource), 'renderer product version is not sourced from the Vite identity define');
  assert(/readProductVersion/.test(viteSource) && /__SCRIPTCUT_PRODUCT_VERSION__/.test(viteSource), 'Vite does not source the renderer identity from root package metadata');
  assert(!/SCRIPTCUT_VERSION|0\.1\.0-alpha\.(?:2|3)/.test(`${rendererSource}\n${settingsSource}`), 'renderer contains a stale prerelease version hardcode');
  assert(/RELEASE_LINKS\.releases/.test(`${rendererSource}\n${settingsSource}\n${homeSource}`), 'renderer does not use the GitHub Releases feed');
  assert(!/releases\/latest/.test(`${rendererSource}\n${settingsSource}\n${homeSource}`), 'renderer still labels releases/latest as current');

  const releaseTag = formatAlphaReleaseTag(productVersion, 3);
  const parsed = parseAlphaReleaseTag(releaseTag, productVersion);
  assert(parsed?.productVersion === productVersion && parsed.iteration === 3 && parsed.channel === 'alpha', 'alpha parser did not round-trip the canonical tag');
  assert(formatAlphaReleaseTag(productVersion, parsed.iteration) === releaseTag, 'alpha formatter did not round-trip the parsed tag');
  assert(formatPublicArtifactFilename(releaseTag, productVersion, 'arm64') === 'ScriptCut-v0.1.0-alpha.3-arm64.dmg', 'public artifact naming did not use the validated releaseTag');
  assert(formatCandidateArtifactFilename(productVersion, 'arm64') === 'ScriptCut-0.1.0-arm64.dmg', 'candidate artifact naming did not use productVersion');

  expectFailure(() => validateAlphaReleaseTag('v0.1.1-alpha.1', productVersion), 'wrong product version tag');
  expectFailure(() => validateAlphaReleaseTag('v0.1.0-alpha.0', productVersion), 'alpha.0');
  expectFailure(() => validateAlphaReleaseTag('v0.1.0-beta.1', productVersion), 'beta tag');
  expectFailure(() => validateAlphaReleaseTag('v0.1.0-alpha.2', productVersion, ['v0.1.0-alpha.1', 'v0.1.0-alpha.2']), 'existing alpha tag');
  expectFailure(() => validateAlphaReleaseTag('v0.1.0-alpha.2', productVersion, ['v0.1.0-alpha.3']), 'non-monotonic alpha tag');
  assert(validateAlphaReleaseTag(releaseTag, productVersion, ['v0.1.0-alpha.1', 'v0.1.0-alpha.2']).iteration === 3, 'monotonic alpha validation rejected the next iteration');

  const publicSource = fs.readFileSync(path.join(root, 'scripts', 'prepare-public-release.js'), 'utf8');
  const candidateSource = fs.readFileSync(path.join(root, 'scripts', 'release-alpha.js'), 'utf8');
  assert(/validateAlphaReleaseTag/.test(publicSource) && /formatPublicArtifactFilename\(tagInfo\.releaseTag/.test(publicSource), 'public preparation is not consuming the centralized identity contract');
  assert(/channel:\s*'internal-release-candidate'/.test(candidateSource) && /tagCandidate:\s*null/.test(candidateSource) && /tagExists:\s*false/.test(candidateSource), 'candidate identity does not remain internal and untagged');
  assert(!/releaseTag\s*:/.test(candidateSource), 'candidate machinery claims a public releaseTag');

  console.log(`Canonical release identity smoke passed: productVersion=${productVersion}, publicExample=${releaseTag}, channel=alpha-only`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
