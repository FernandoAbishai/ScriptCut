#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { inspectPackage } = require('./check-packaged-runtime');

const root = path.join(__dirname, '..');
const distDir = path.join(root, 'dist');
const releaseDir = path.join(distDir, 'release-candidate');
const packageOutputDir = path.join(releaseDir, 'app');
const releaseMetadataDir = releaseDir;

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
  if (result.error) throw new Error(`${name} failed: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${name} failed with exit code ${result.status}.`);
}

function ensureReleaseDirs() {
  fs.rmSync(releaseDir, { recursive: true, force: true });
  fs.mkdirSync(packageOutputDir, { recursive: true });
}

function releaseEnv() {
  const env = {
    ...process.env,
    ELECTRON_CACHE: path.join(root, '.cache', 'electron'),
    ELECTRON_BUILDER_CACHE: path.join(root, '.cache', 'electron-builder'),
    CSC_IDENTITY_AUTO_DISCOVERY: 'false',
    SCRIPTCUT_RELEASE_MODE: 'candidate',
    SCRIPTCUT_RELEASE_ARCH: 'arm64',
    SCRIPTCUT_BUILD_ARCH: 'arm64',
  };
  for (const name of [
    'CSC_LINK',
    'CSC_KEY_PASSWORD',
    'CSC_NAME',
    'APPLE_API_KEY',
    'APPLE_API_KEY_ID',
    'APPLE_API_ISSUER',
    'APPLE_ID',
    'APPLE_APP_SPECIFIC_PASSWORD',
    'APPLE_TEAM_ID',
    'APPLE_KEYCHAIN',
    'APPLE_KEYCHAIN_PROFILE',
  ]) delete env[name];
  return env;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function currentGitCommit() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (result.status !== 0) throw new Error('Could not determine the candidate commit.');
  return result.stdout.trim();
}

function findFiles(directory, predicate, found = []) {
  if (!fs.existsSync(directory)) return found;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (predicate(entryPath, entry)) found.push(entryPath);
    if (entry.isDirectory()) findFiles(entryPath, predicate, found);
  }
  return found;
}

function candidateOutputs(pkg) {
  const expectedDmg = `ScriptCut-${pkg.version}-arm64.dmg`;
  const dmgs = findFiles(packageOutputDir, (filePath, entry) => entry.isFile() && path.basename(filePath) === expectedDmg);
  if (dmgs.length !== 1) throw new Error(`Expected exactly one current candidate DMG ${expectedDmg}; found ${dmgs.length}.`);
  const apps = findFiles(packageOutputDir, (filePath, entry) => entry.isDirectory() && entry.name === 'ScriptCut.app');
  if (apps.length !== 1) throw new Error(`Expected exactly one current candidate ScriptCut.app; found ${apps.length}.`);
  return { dmgPath: dmgs[0], appPath: apps[0] };
}

function stageCandidateArtifact(dmgPath) {
  const stagedPath = path.join(releaseMetadataDir, path.basename(dmgPath));
  fs.copyFileSync(dmgPath, stagedPath);
  return stagedPath;
}

function checksumFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath, { highWaterMark: 1024 * 1024 });
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function writeChecksums(artifact) {
  const sha256 = await checksumFile(artifact.path);
  const checksumPath = path.join(releaseMetadataDir, 'SHA256SUMS.txt');
  fs.writeFileSync(checksumPath, `${sha256}  ${artifact.filename}\n`, 'utf8');
  return { checksumPath, sha256 };
}

function readProvenance() {
  const runtimeManifestPath = path.join(root, 'build', 'manifests', 'runtime-manifest.json');
  const coreInventoryPath = path.join(root, 'build', 'manifests', 'core-installed-distributions.txt');
  const ffmpegManifestPath = path.join(root, 'build', 'bin', 'darwin-arm64', 'bundle-manifest.json');
  const modelManifestPath = path.join(root, 'runtime', 'models', 'whisper-base.json');
  for (const filePath of [runtimeManifestPath, coreInventoryPath, ffmpegManifestPath, modelManifestPath]) {
    if (!fs.existsSync(filePath)) throw new Error(`Missing generated provenance input: ${path.relative(root, filePath)}`);
  }
  return {
    runtimeManifestPath,
    coreInventoryPath,
    ffmpegManifestPath,
    modelManifestPath,
    runtime: readJson(runtimeManifestPath),
    ffmpeg: readJson(ffmpegManifestPath),
    model: readJson(modelManifestPath),
  };
}

async function createReleaseManifest(pkg, artifact, checksums, provenance) {
  const manifest = {
    schema: 'scriptcut.release.v1',
    productName: pkg.build?.productName || pkg.name,
    version: pkg.version,
    channel: 'internal-release-candidate',
    tagCandidate: null,
    tagExists: false,
    platform: 'darwin',
    architecture: 'arm64',
    commit: currentGitCommit(),
    generatedAt: new Date().toISOString(),
    artifact: {
      filename: artifact.filename,
      bytes: artifact.bytes,
      sha256: checksums.sha256,
    },
    checksums: 'SHA256SUMS.txt',
    runtime: {
      mode: 'packaged-bundled',
      pythonSource: 'bundled',
      target: provenance.runtime.target,
      schema: provenance.runtime.schema,
      pythonVersion: provenance.runtime.python.version,
      pythonBuild: provenance.runtime.python.build,
      manifestSha256: await checksumFile(provenance.runtimeManifestPath),
    },
    coreInventorySha256: await checksumFile(provenance.coreInventoryPath),
    ffmpeg: {
      platform: provenance.ffmpeg.platform,
      architecture: provenance.ffmpeg.arch,
      manifestSha256: await checksumFile(provenance.ffmpegManifestPath),
    },
    model: {
      id: provenance.model.id,
      revision: provenance.model.revision,
      expectedBytes: provenance.model.expectedBytes,
      sha256: provenance.model.sha256,
      manifestSha256: await checksumFile(provenance.modelManifestPath),
      embedded: false,
    },
    codeSignature: {
      type: 'ad-hoc',
      structurallyValid: true,
      hardenedRuntime: false,
    },
    signed: false,
    notarized: false,
    reproducible: false,
    reproducibilityNote: 'Transitive runtime wheel hashes are not fully locked in this phase.',
  };
  const manifestPath = path.join(releaseMetadataDir, 'release-manifest.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return { manifestPath, manifest };
}

function writeReleaseNotes(pkg, artifact, checksums, manifest) {
  const notesPath = path.join(releaseMetadataDir, 'RELEASE_NOTES.md');
  fs.writeFileSync(notesPath, `# ScriptCut ${pkg.version} internal release candidate

This is an internal release candidate for native macOS arm64 validation. It is not for public distribution.

## Creator install path

1. Download the candidate DMG.
2. Install and open ScriptCut.
3. Select a video.

The candidate includes its application runtime and bundled FFmpeg/FFprobe. Baseline local transcription is included. The verified baseline Whisper model downloads into app-managed storage on first transcription; after that verified model is installed, baseline transcription can run locally without model-network access. Optional capabilities may not be included in this build.

Creators do not need to install Python, run pip, download FFmpeg, configure PATH, or create a virtual environment for this candidate path.

## Trust status

- Candidate signing state: ad-hoc structural signature.
- Developer ID signing state: not signed with Apple Developer ID.
- Notarization state: not notarized.
- This candidate is not Gatekeeper-approved and is not ready for public distribution.
- No tag or GitHub Release was created by this preparation.

## Artifacts

- ${artifact.filename}
- SHA256SUMS.txt
- release-manifest.json

Artifact SHA-256: \`${checksums.sha256}\`
Runtime mode: \`${manifest.runtime.mode}\`; Python source: \`${manifest.runtime.pythonSource}\`; target: \`${manifest.runtime.target.platform}-${manifest.runtime.target.arch}\`.
`, 'utf8');
  return notesPath;
}

function runPackagedGate(name, script, args, env) {
  runStep(name, 'node', [script, ...args], { env });
}

function runPackagedPythonGate(name, script, packageInfo, env, args = []) {
  const smokeEnv = {
    ...env,
    ...packageInfo.plan.environment,
    SCRIPTCUT_PACKAGED_BACKEND_ROOT: packageInfo.plan.backendRoot,
    SCRIPTCUT_RUNTIME_MODE: 'packaged-bundled',
    PYTHONNOUSERSITE: '1',
    PYTHONPATH: packageInfo.corePackRoot,
    PATH: '/usr/bin:/bin',
  };
  runStep(name, packageInfo.plan.command, [path.join(root, script), ...args], { env: smokeEnv });
}

async function main() {
  if (!process.argv.includes('--candidate')) {
    throw new Error('Phase 3B.5A only prepares an explicit ad-hoc candidate. Use --candidate; signed distribution is reserved for Phase 3B.5B.');
  }
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    throw new Error(`Release candidates require native macOS arm64, received ${process.platform}-${process.arch}.`);
  }

  const pkg = readPackage();
  const env = releaseEnv();
  const realModel = process.argv.includes('--real-model');
  const useGpu = process.argv.includes('--use-gpu');
  const requireMps = process.argv.includes('--require-mps');
  ensureReleaseDirs();

  runStep('Release candidate trust readiness', 'node', ['scripts/check-release-trust.js', '--candidate'], { env });
  runStep('Prepare bundled FFmpeg', 'npm', ['run', 'release:ffmpeg'], { env });
  runStep('Prepare portable Python and core pack', 'npm', ['run', 'runtime:prepare:mac-arm64'], { env });
  runStep('Validate native release platform', 'node', ['scripts/release-platform.js', '--arch', 'arm64'], { env });
  runStep('Build frontend', 'npm', ['run', 'build:frontend'], { env });
  runStep('Frontend packaged asset reference smoke', 'node', ['frontend/scripts/smoke-home-onboarding.mjs'], { env });
  runStep('Canonical brand asset smoke', 'npm', ['run', 'smoke:brand'], { env });
  runStep('Packaged renderer policy smoke', 'npm', ['run', 'smoke:renderer-policy'], { env });
  runStep('Build ad-hoc self-contained arm64 DMG', 'node_modules/.bin/electron-builder', [
    '--config', 'electron-builder.release.cjs',
    '--arm64',
    '--publish', 'never',
  ], { env });

  const outputs = candidateOutputs(pkg);
  const packageInfo = inspectPackage(outputs.appPath);
  runPackagedGate('Packaged runtime gate', 'scripts/check-packaged-runtime.js', ['--arch', 'arm64', '--app', outputs.appPath], env);
  runPackagedGate('Packaged FFmpeg gate', 'scripts/check-packaged-ffmpeg.js', ['--arch', 'arm64', '--app', outputs.appPath], env);
  runPackagedGate('Packaged backend gate', 'scripts/smoke-packaged-backend.js', ['--arch', 'arm64', '--app', outputs.appPath], env);
  runPackagedGate('Electron-like packaged backend startup gate', 'scripts/check-packaged-electron-backend.js', ['--app', outputs.appPath], env);
  runPackagedGate('Packaged Electron renderer transport gate', 'scripts/smoke-packaged-electron-renderer.js', ['--app', outputs.appPath], env);
  runPackagedPythonGate(
    'Whisper MPS word-timing compatibility gate',
    'scripts/smoke-whisper-mps-word-timing.py',
    packageInfo,
    env,
    requireMps ? ['--require-mps'] : [],
  );
  runPackagedGate('Packaged optional-capability gate', 'scripts/smoke-packaged-optional-capabilities.js', ['--arch', 'arm64', '--app', outputs.appPath], env);
  const transcriptionArgs = ['--arch', 'arm64', '--app', outputs.appPath];
  if (realModel) transcriptionArgs.push('--real-model');
  if (useGpu) transcriptionArgs.push('--use-gpu');
  if (realModel && !useGpu) console.log('Hosted real model: CPU');
  if (realModel && useGpu && requireMps) console.log('Physical Mac real model: MPS required');
  runPackagedGate('Packaged transcription contract gate', 'scripts/smoke-packaged-transcription.js', transcriptionArgs, env);
  runPackagedGate('macOS signing-readiness inventory', 'scripts/check-macos-signing-readiness.js', ['--app', outputs.appPath], env);
  runPackagedGate('Candidate DMG inspection', 'scripts/check-release-candidate.js', ['--app', outputs.appPath, '--dmg', outputs.dmgPath], env);

  const stagedDmgPath = stageCandidateArtifact(outputs.dmgPath);
  const artifact = {
    path: stagedDmgPath,
    filename: path.basename(stagedDmgPath),
    bytes: fs.statSync(stagedDmgPath).size,
  };
  const checksums = await writeChecksums(artifact);
  const provenance = readProvenance();
  const { manifestPath, manifest } = await createReleaseManifest(pkg, artifact, checksums, provenance);
  const notesPath = writeReleaseNotes(pkg, artifact, checksums, manifest);
  runStep('Release metadata smoke', 'node', ['scripts/smoke-release-metadata.js', '--dir', releaseMetadataDir], { env });

  console.log('\nAd-hoc self-contained release candidate prepared.');
  console.log(`Candidate app: ${path.relative(root, outputs.appPath)}`);
  console.log(`Candidate DMG: ${path.relative(root, stagedDmgPath)}`);
  console.log(`Release notes: ${path.relative(root, notesPath)}`);
  console.log(`Release manifest: ${path.relative(root, manifestPath)}`);
  console.log(`Checksums: ${path.relative(root, checksums.checksumPath)}`);
  console.log('No tag, GitHub Release, Developer ID signing, or notarization was performed.');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = { checksumFile, createReleaseManifest, writeChecksums };
