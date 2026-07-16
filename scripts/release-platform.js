#!/usr/bin/env node

/**
 * Validates that a macOS release has a matching, runnable FFmpeg bundle.
 *
 * Electron can cross-package an app, but ScriptCut's bundled FFmpeg must be
 * built for the same CPU architecture as the app that will run it.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const supportedArchitectures = new Set(['arm64', 'x64']);

function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function releaseArchitecture() {
  return optionValue('--arch') || process.env.SCRIPTCUT_RELEASE_ARCH || process.arch;
}

function fail(message) {
  console.error(`Release platform check failed: ${message}`);
  process.exit(1);
}

function executableExists(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function run(filePath, args) {
  const result = spawnSync(filePath, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) {
    fail(`${path.basename(filePath)} could not run: ${(result.error?.message || result.stderr || result.stdout || '').trim()}`);
  }
}

function main() {
  if (process.platform !== 'darwin') {
    fail('macOS releases must be prepared on macOS so the FFmpeg bundle can be verified.');
  }

  const arch = releaseArchitecture();
  if (!supportedArchitectures.has(arch)) {
    fail(`unsupported architecture "${arch}". Expected arm64 or x64.`);
  }
  if (arch !== process.arch) {
    fail(`target ${arch} does not match this ${process.arch} host. Build the release on a native ${arch} Mac with its matching FFmpeg bundle.`);
  }

  const bundleDir = path.join(root, 'build', 'bin', `darwin-${arch}`);
  const manifestPath = path.join(bundleDir, 'bundle-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    fail(`missing ${path.relative(root, manifestPath)}. Run npm run release:ffmpeg on this Mac first.`);
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    fail(`could not parse ${path.relative(root, manifestPath)}: ${error.message}`);
  }

  if (manifest.platform !== 'darwin' || manifest.arch !== arch) {
    fail(`bundle manifest is for ${manifest.platform || 'unknown'}-${manifest.arch || 'unknown'}, not darwin-${arch}.`);
  }

  for (const tool of ['ffmpeg', 'ffprobe']) {
    const toolPath = path.join(bundleDir, tool);
    if (!executableExists(toolPath)) {
      fail(`missing executable ${path.relative(root, toolPath)}.`);
    }
    run(toolPath, ['-version']);
  }

  const captions = manifest.capabilities?.assSubtitles ? 'burn-in captions' : 'sidecar SRT captions';
  console.log(`Release platform ready: macOS ${arch} with ${captions}.`);
}

main();
