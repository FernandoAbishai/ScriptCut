#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const distDir = path.join(root, 'dist');
const releaseDir = path.join(distDir, 'release-alpha');
const cacheRoot = path.join(root, '.cache');
const electronCache = path.join(cacheRoot, 'electron');
const electronBuilderCache = path.join(cacheRoot, 'electron-builder');

function readPackage() {
  return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
}

function runStep(name, command, args, options = {}) {
  console.log(`\n==> ${name}`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: options.env || process.env,
  });

  if (result.error) {
    console.error(`\n${name} failed: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`\n${name} failed with exit code ${result.status}.`);
    process.exit(result.status || 1);
  }
}

function ensureReleaseDirs() {
  fs.mkdirSync(releaseDir, { recursive: true });
  fs.mkdirSync(electronCache, { recursive: true });
  fs.mkdirSync(electronBuilderCache, { recursive: true });
}

function releaseEnv() {
  return {
    ...process.env,
    ELECTRON_CACHE: electronCache,
    ELECTRON_BUILDER_CACHE: electronBuilderCache,
  };
}

function findArtifacts() {
  if (!fs.existsSync(distDir)) return [];
  return fs.readdirSync(distDir)
    .filter((name) => /\.(dmg|zip|AppImage|exe)$/i.test(name))
    .map((name) => path.join(distDir, name))
    .filter((filePath) => fs.statSync(filePath).isFile());
}

function checksumFile(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function writeChecksums(artifacts) {
  const lines = artifacts.map((filePath) => `${checksumFile(filePath)}  ${path.basename(filePath)}`);
  const checksumPath = path.join(releaseDir, 'SHA256SUMS.txt');
  fs.writeFileSync(checksumPath, `${lines.join('\n')}\n`, 'utf8');
  return checksumPath;
}

function writeReleaseNotes(pkg, artifacts, checksumPath) {
  const tag = `v${pkg.version}-alpha`;
  const notesPath = path.join(releaseDir, 'RELEASE_NOTES.md');
  const artifactList = artifacts
    .map((filePath) => `- ${path.basename(filePath)}`)
    .concat(`- ${path.relative(root, checksumPath)}`)
    .join('\n');

  fs.writeFileSync(notesPath, `# ScriptCut ${tag}

ScriptCut is an open-source, local-first desktop video editor for creators.

## Highlights

- Edit video by editing transcript text.
- Export source, square, and vertical shorts clips.
- Burn in creator captions.
- Package clip titles, captions, descriptions, hashtags, and hook-frame notes.
- Use optional AI helpers while keeping media local.

## Install

1. Download the macOS DMG attached to this release.
2. Open ScriptCut.
3. Run the first-launch checks and follow any setup prompts.

## Alpha Status

This is an alpha build. Keep original media and project backups.

## Assets

${artifactList}

## Verify Download

Compare the downloaded file against \`SHA256SUMS.txt\`.
`, 'utf8');
  return notesPath;
}

function main() {
  const pkg = readPackage();
  ensureReleaseDirs();

  runStep('Release trust readiness', 'node', ['scripts/check-release-trust.js']);
  runStep('Prepare bundled FFmpeg', 'npm', ['run', 'release:ffmpeg']);
  runStep('Desktop package QA', 'npm', ['run', 'qa:desktop:package'], { env: releaseEnv() });
  runStep('Build macOS DMG', 'npm', ['run', 'dist:mac'], { env: releaseEnv() });

  const artifacts = findArtifacts();
  if (artifacts.length === 0) {
    console.error('\nNo release artifacts found in dist/.');
    process.exit(1);
  }

  const checksumPath = writeChecksums(artifacts);
  const notesPath = writeReleaseNotes(pkg, artifacts, checksumPath);

  console.log('\nAlpha release package prepared.');
  console.log(`Release notes: ${path.relative(root, notesPath)}`);
  console.log(`Checksums: ${path.relative(root, checksumPath)}`);
  for (const artifact of artifacts) {
    console.log(`Artifact: ${path.relative(root, artifact)}`);
  }
  console.log('\nDraft the GitHub release with:');
  console.log(`gh release create v${pkg.version}-alpha --draft --title "ScriptCut v${pkg.version}-alpha" --notes-file ${path.relative(root, notesPath)} ${artifacts.map((artifact) => path.relative(root, artifact)).join(' ')} ${path.relative(root, checksumPath)}`);
}

main();
