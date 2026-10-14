#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { readProductVersion } = require('./release-identity');

const root = path.join(__dirname, '..');

function fail(message) {
  throw new Error(`Signed release preparation failed: ${message}`);
}

function run(name, command, args, options = {}) {
  console.log(`\n==> ${name}`);
  const result = spawnSync(command, args, {
    cwd: root,
    env: options.env || process.env,
    stdio: 'inherit',
  });
  if (result.error || result.status !== 0) {
    fail(`${name} failed${result.error ? `: ${result.error.message}` : ` with exit code ${result.status}`}`);
  }
}

function main() {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    fail(`requires native macOS arm64, received ${process.platform}-${process.arch}`);
  }
  const version = readProductVersion();
  const outputRoot = path.join(root, 'dist', 'signed-release', 'app');
  const realModel = process.argv.includes('--real-model');

  run('Credentialed release trust preflight', 'node', ['scripts/check-release-trust.js', '--signed']);
  fs.rmSync(path.join(root, 'dist', 'signed-release'), { recursive: true, force: true });
  run('Generate release icons', 'npm', ['run', 'release:icons']);
  run('Verify macOS icon', 'npm', ['run', 'check:macos-icon']);
  run('Prepare FFmpeg bundle', 'npm', ['run', 'release:ffmpeg']);
  run('Build frontend', 'npm', ['run', 'build:frontend']);
  run('Prepare hash-locked Python runtime', 'npm', ['run', 'runtime:prepare:mac-arm64']);
  run('Build DMG containing Developer ID signed and notarized app', 'npx', [
    'electron-builder', '--config', 'electron-builder.signed.cjs', '--mac', 'dmg', '--arm64', '--publish', 'never',
  ]);

  const appPath = path.join(outputRoot, 'mac-arm64', 'ScriptCut.app');
  const dmgPath = path.join(outputRoot, `ScriptCut-${version}-arm64.dmg`);
  run('Packaged runtime gate', 'node', ['scripts/check-packaged-runtime.js', '--arch', 'arm64', '--app', appPath]);
  run('Packaged release identity gate', 'node', ['scripts/smoke-packaged-release-identity.js', '--app', appPath]);
  run('Packaged FFmpeg gate', 'node', ['scripts/check-packaged-ffmpeg.js', '--arch', 'arm64', '--app', appPath]);
  run('Packaged backend gate', 'node', ['scripts/smoke-packaged-backend.js', '--arch', 'arm64', '--app', appPath]);
  run('Electron-like packaged backend startup gate', 'node', ['scripts/check-packaged-electron-backend.js', '--app', appPath]);
  run('Packaged Electron renderer transport gate', 'node', ['scripts/smoke-packaged-electron-renderer.js', '--app', appPath]);
  run('Packaged creator qualification gate', 'node', ['scripts/smoke-packaged-creator-qualification.js', '--app', appPath]);
  run('Packaged optional-capability gate', 'node', ['scripts/smoke-packaged-optional-capabilities.js', '--arch', 'arm64', '--app', appPath]);
  const transcriptionArgs = ['scripts/smoke-packaged-transcription.js', '--arch', 'arm64', '--app', appPath];
  if (realModel) transcriptionArgs.push('--real-model');
  run('Packaged transcription contract gate', 'node', transcriptionArgs);
  run('Verify DMG integrity and signed/notarized app trust', 'node', [
    'scripts/check-macos-signed-release.js', '--app', appPath, '--dmg', dmgPath,
  ]);
  console.log(`\nSigned release artifact: ${path.relative(root, dmgPath)}`);
  console.log('No tag or GitHub Release was created.');
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
