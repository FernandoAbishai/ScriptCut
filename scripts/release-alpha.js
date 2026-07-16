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
  fs.rmSync(releaseDir, { recursive: true, force: true });
  fs.mkdirSync(releaseDir, { recursive: true });
  fs.mkdirSync(electronCache, { recursive: true });
  fs.mkdirSync(electronBuilderCache, { recursive: true });
}

function releaseEnv() {
  const env = {
    ...process.env,
    ELECTRON_CACHE: electronCache,
    ELECTRON_BUILDER_CACHE: electronBuilderCache,
  };
  if (!env.CSC_LINK && !env.CSC_NAME && !env.CSC_IDENTITY_AUTO_DISCOVERY) {
    // Avoid accidentally selecting a local Apple Development certificate for an unsigned alpha.
    env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
  }
  return env;
}

function releaseArchitecture() {
  const arch = process.env.SCRIPTCUT_RELEASE_ARCH?.trim() || process.arch;
  if (!['arm64', 'x64'].includes(arch)) {
    throw new Error(`Unsupported macOS release architecture: ${arch}. Expected arm64 or x64.`);
  }
  return arch;
}

function releasePlatformLabel(arch) {
  return arch === 'arm64' ? 'macOS Apple Silicon (arm64)' : 'macOS Intel (x64)';
}

function findArtifacts() {
  if (!fs.existsSync(distDir)) return [];
  return fs.readdirSync(distDir)
    .filter((name) => /\.(dmg|zip|AppImage|exe)$/i.test(name))
    .map((name) => path.join(distDir, name))
    .filter((filePath) => fs.statSync(filePath).isFile());
}

function snapshotArtifacts() {
  return new Map(findArtifacts().map((filePath) => {
    const stat = fs.statSync(filePath);
    return [filePath, { bytes: stat.size, modifiedAt: stat.mtimeMs }];
  }));
}

function findFreshArtifacts(before) {
  return findArtifacts().filter((filePath) => {
    const stat = fs.statSync(filePath);
    const previous = before.get(filePath);
    return !previous || previous.bytes !== stat.size || previous.modifiedAt !== stat.mtimeMs;
  });
}

function checksumFile(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function currentGitCommit() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return result.status === 0 ? result.stdout.trim() : '';
}

function readFfmpegBundleManifest(arch) {
  const manifestPath = path.join(root, 'build', 'bin', `darwin-${arch}`, 'bundle-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('FFmpeg bundle manifest is missing. Run npm run release:ffmpeg before preparing a release.');
  }
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function releaseTag(pkg) {
  const tag = process.env.RELEASE_TAG?.trim() || `v${pkg.version}-alpha`;
  const expectedPrefix = `v${pkg.version}-alpha`;
  if (!tag.startsWith(expectedPrefix)) {
    console.error(`\nRELEASE_TAG must start with ${expectedPrefix}. Received: ${tag}`);
    process.exit(1);
  }
  return tag;
}

function writeChecksums(artifacts) {
  const lines = artifacts.map((filePath) => `${checksumFile(filePath)}  ${path.basename(filePath)}`);
  const checksumPath = path.join(releaseDir, 'SHA256SUMS.txt');
  fs.writeFileSync(checksumPath, `${lines.join('\n')}\n`, 'utf8');
  return checksumPath;
}

function writeReleaseManifest(pkg, tag, artifacts, checksumPath, ffmpegBundle, arch) {
  const manifestPath = path.join(releaseDir, 'release-manifest.json');
  const manifest = {
    name: pkg.name,
    productName: pkg.build?.productName || pkg.name,
    version: pkg.version,
    channel: 'alpha',
    tag,
    platform: 'darwin',
    architecture: arch,
    compatibility: releasePlatformLabel(arch),
    commit: currentGitCommit(),
    generatedAt: new Date().toISOString(),
    ffmpegBundle,
    checksums: path.relative(root, checksumPath),
    assets: artifacts.map((filePath) => ({
      file: path.basename(filePath),
      path: path.relative(root, filePath),
      bytes: fs.statSync(filePath).size,
      sha256: checksumFile(filePath),
    })),
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifestPath;
}

function writeReleaseNotes(pkg, tag, artifacts, checksumPath, ffmpegBundle, arch) {
  const notesPath = path.join(releaseDir, 'RELEASE_NOTES.md');
  const artifactList = artifacts
    .map((filePath) => `- ${path.basename(filePath)}`)
    .concat(`- ${path.relative(root, checksumPath)}`)
    .join('\n');

  const captionNote = ffmpegBundle.capabilities?.assSubtitles
    ? 'Burn in creator captions directly into exported video.'
    : 'Export a matching `.srt` caption file when burn-in captions are selected.';

  fs.writeFileSync(notesPath, `# ScriptCut ${tag}

ScriptCut is an open-source, local-first desktop video editor for creators.

## Highlights

- Edit video by editing transcript text.
- Export source, square, and vertical shorts clips.
- ${captionNote}
- Package clip titles, captions, descriptions, hashtags, and hook-frame notes.
- Use optional AI helpers while keeping media local.

## Install

1. Download the ${releasePlatformLabel(arch)} DMG attached to this release.
2. Open ScriptCut.
3. Run the first-launch checks and follow any setup prompts.

## Compatibility

- This package is for ${releasePlatformLabel(arch)}.
- It includes portable FFmpeg and FFprobe for local export.
- This developer alpha still uses a compatible local Python runtime and ScriptCut backend dependency set. See the install guide before downloading.

## Alpha Status

This is a developer alpha build. Keep original media and project backups.

## Assets

${artifactList}

## Verify Download

Compare the downloaded file against \`SHA256SUMS.txt\`.
`, 'utf8');
  return notesPath;
}

function main() {
  if (process.platform !== 'darwin') {
    throw new Error('ScriptCut macOS releases must be prepared on macOS.');
  }
  const pkg = readPackage();
  const tag = releaseTag(pkg);
  const arch = releaseArchitecture();
  ensureReleaseDirs();

  const env = {
    ...releaseEnv(),
    SCRIPTCUT_RELEASE_ARCH: arch,
    SCRIPTCUT_BUILD_ARCH: arch,
  };

  runStep('Release trust readiness', 'node', ['scripts/check-release-trust.js']);
  runStep('Prepare bundled FFmpeg', 'npm', ['run', 'release:ffmpeg']);
  runStep('Validate macOS release platform', 'node', ['scripts/release-platform.js', '--arch', arch], { env });
  const ffmpegBundle = readFfmpegBundleManifest(arch);
  runStep('Desktop package QA', 'npm', ['run', 'qa:desktop:package'], { env });
  const beforeBuild = snapshotArtifacts();
  runStep(`Build ${releasePlatformLabel(arch)} DMG`, 'npm', ['run', `dist:mac:${arch}`], { env });

  const artifacts = findFreshArtifacts(beforeBuild);
  if (artifacts.length === 0) {
    console.error('\nNo release artifacts found in dist/.');
    process.exit(1);
  }

  const checksumPath = writeChecksums(artifacts);
  const manifestPath = writeReleaseManifest(pkg, tag, artifacts, checksumPath, ffmpegBundle, arch);
  const notesPath = writeReleaseNotes(pkg, tag, artifacts, checksumPath, ffmpegBundle, arch);

  console.log('\nAlpha release package prepared.');
  console.log(`Release notes: ${path.relative(root, notesPath)}`);
  console.log(`Release manifest: ${path.relative(root, manifestPath)}`);
  console.log(`Checksums: ${path.relative(root, checksumPath)}`);
  for (const artifact of artifacts) {
    console.log(`Artifact: ${path.relative(root, artifact)}`);
  }
  console.log('\nDraft the GitHub release with:');
  console.log(`gh release create ${tag} --draft --title "ScriptCut ${tag}" --notes-file ${path.relative(root, notesPath)} ${artifacts.map((artifact) => path.relative(root, artifact)).join(' ')} ${path.relative(root, checksumPath)} ${path.relative(root, manifestPath)}`);
}

main();
