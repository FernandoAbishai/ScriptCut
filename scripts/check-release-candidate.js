#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');

function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(message) {
  throw new Error(`Release candidate check failed: ${message}`);
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.error || result.status !== 0) {
    fail(`${command} ${args.join(' ')} failed: ${(result.error?.message || result.stderr || result.stdout || '').trim()}`);
  }
  return result;
}

function findNamed(directory, name, found = []) {
  if (!fs.existsSync(directory)) return found;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.name === name) found.push(entryPath);
    if (entry.isDirectory()) findNamed(entryPath, name, found);
  }
  return found;
}

function inspectDmg(dmgPath) {
  run('hdiutil', ['verify', dmgPath]);
  const mountPoint = fs.mkdtempSync(path.join(os.tmpdir(), 'scriptcut-rc-dmg-'));
  let attached = false;
  try {
    run('hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mountPoint, dmgPath]);
    attached = true;
    if (!fs.existsSync(path.join(mountPoint, 'ScriptCut.app'))) fail('verified DMG does not contain ScriptCut.app');
    console.log('DMG inspection: verified, read-only mounted, ScriptCut.app present');
  } finally {
    if (attached) run('hdiutil', ['detach', mountPoint]);
    fs.rmSync(mountPoint, { recursive: true, force: true });
  }
}

function main() {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') fail(`requires native macOS arm64, received ${process.platform}-${process.arch}`);
  const appPath = path.resolve(optionValue('--app') || '');
  const dmgPath = path.resolve(optionValue('--dmg') || '');
  if (!appPath || !appPath.endsWith('.app') || !fs.existsSync(appPath)) fail('candidate app path is missing');
  if (!dmgPath || !dmgPath.endsWith('.dmg') || !fs.existsSync(dmgPath)) fail('candidate DMG path is missing');
  const resources = path.join(appPath, 'Contents', 'Resources');
  for (const relative of [
    'backend',
    'bin/darwin-arm64/ffmpeg',
    'bin/darwin-arm64/ffprobe',
    'manifests/runtime-manifest.json',
    'manifests/model-manifest.json',
    'runtime',
    'LICENSE',
    'THIRD_PARTY_NOTICES.md',
    'ACKNOWLEDGEMENTS.md',
    'LICENSES/CutScript-MIT.txt',
  ]) {
    if (!fs.existsSync(path.join(resources, relative))) fail(`candidate resource missing: ${relative}`);
  }
  if (findNamed(resources, 'base.pt').length > 0) fail('base.pt is embedded in the candidate app');
  for (const forbidden of ['whisperx', 'nemo', 'pyannote', 'deepfilternet', 'mediapipe', 'cv2', 'openai', 'anthropic', 'moviepy']) {
    if (findNamed(resources, forbidden).length > 0) fail(`optional package is embedded in the candidate app: ${forbidden}`);
  }
  inspectDmg(dmgPath);
  console.log('Release candidate content gate passed.');
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

module.exports = { inspectDmg };
