#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const CORE_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const ALPHA_TAG_PATTERN = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-alpha\.([1-9]\d*)$/;

function assertProductVersion(productVersion) {
  if (typeof productVersion !== 'string' || !CORE_VERSION_PATTERN.test(productVersion)) {
    throw new Error('productVersion must be MAJOR.MINOR.PATCH core SemVer');
  }
  return productVersion;
}

function readProductVersion(packagePath = path.join(root, 'package.json')) {
  let packageJson;
  try {
    packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  } catch (error) {
    throw new Error(`could not read product package metadata: ${error.message}`);
  }
  return assertProductVersion(packageJson.version);
}

function formatAlphaReleaseTag(productVersion, iteration) {
  assertProductVersion(productVersion);
  if (!Number.isSafeInteger(iteration) || iteration < 1) {
    throw new Error('prereleaseIteration must be a positive safe integer');
  }
  return `v${productVersion}-alpha.${iteration}`;
}

function parseAlphaReleaseTag(tag, productVersion) {
  assertProductVersion(productVersion);
  if (typeof tag !== 'string') return null;
  const match = ALPHA_TAG_PATTERN.exec(tag);
  if (!match || `${match[1]}.${match[2]}.${match[3]}` !== productVersion) return null;
  const iteration = Number(match[4]);
  if (!Number.isSafeInteger(iteration) || iteration < 1) return null;
  return {
    tag,
    releaseTag: tag,
    productVersion,
    releaseChannel: 'alpha',
    channel: 'alpha',
    prereleaseIteration: iteration,
    iteration,
    suffix: iteration,
  };
}

function alphaSuffix(tag, productVersion) {
  return parseAlphaReleaseTag(tag, productVersion)?.iteration ?? null;
}

function highestAlphaSuffix(existingTags, productVersion) {
  if (!Array.isArray(existingTags)) throw new Error('existingTags must be an array');
  return existingTags.reduce((highest, tag) => Math.max(highest, alphaSuffix(tag, productVersion) || 0), 0);
}

function validateAlphaReleaseTag(tag, productVersion, existingTags = []) {
  assertProductVersion(productVersion);
  if (typeof tag !== 'string' || !tag) throw new Error('release_tag is required');
  const parsed = parseAlphaReleaseTag(tag, productVersion);
  if (!parsed) throw new Error(`release tag must match v${productVersion}-alpha.<positive integer>`);
  if (!Array.isArray(existingTags)) throw new Error('existingTags must be an array');
  if (existingTags.includes(tag)) throw new Error(`release tag already exists: ${tag}`);
  const highestExistingIteration = highestAlphaSuffix(existingTags, productVersion);
  if (parsed.iteration <= highestExistingIteration) {
    throw new Error(`release alpha suffix ${parsed.iteration} must be greater than existing highest suffix ${highestExistingIteration}`);
  }
  return {
    ...parsed,
    highestExistingIteration,
    highestExistingSuffix: highestExistingIteration,
  };
}

function formatCandidateArtifactFilename(productVersion, architecture = 'arm64') {
  assertProductVersion(productVersion);
  return `ScriptCut-${productVersion}-${architecture}.dmg`;
}

function formatPublicArtifactFilename(releaseTag, productVersion, architecture = 'arm64') {
  const parsed = parseAlphaReleaseTag(releaseTag, productVersion);
  if (!parsed) throw new Error('releaseTag must be a validated alpha release tag for productVersion');
  return `ScriptCut-${parsed.releaseTag}-${architecture}.dmg`;
}

module.exports = {
  alphaSuffix,
  assertProductVersion,
  formatAlphaReleaseTag,
  formatCandidateArtifactFilename,
  formatPublicArtifactFilename,
  highestAlphaSuffix,
  parseAlphaReleaseTag,
  readProductVersion,
  validateAlphaReleaseTag,
};
