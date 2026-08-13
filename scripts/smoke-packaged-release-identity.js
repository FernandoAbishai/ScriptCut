#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { readProductVersion } = require('./release-identity');

const root = path.join(__dirname, '..');

function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(message) {
  throw new Error(`Packaged release identity smoke failed: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function readPlist(plistPath, key) {
  const result = spawnSync('plutil', ['-extract', key, 'raw', '-o', '-', plistPath], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) fail(`could not read ${key} from Info.plist: ${(result.stderr || result.stdout || '').trim()}`);
  return result.stdout.trim();
}

function main() {
  assert(process.platform === 'darwin' && process.arch === 'arm64', `requires native macOS arm64, received ${process.platform}-${process.arch}`);
  const appPath = path.resolve(optionValue('--app') || '');
  assert(appPath.endsWith('.app') && fs.existsSync(appPath), `packaged app is missing: ${appPath}`);
  const plistPath = path.join(appPath, 'Contents', 'Info.plist');
  assert(fs.existsSync(plistPath), 'packaged Info.plist is missing');

  const productVersion = readProductVersion();
  const bundleIdentifier = readPlist(plistPath, 'CFBundleIdentifier');
  const shortVersion = readPlist(plistPath, 'CFBundleShortVersionString');
  const bundleVersion = readPlist(plistPath, 'CFBundleVersion');
  const executableName = readPlist(plistPath, 'CFBundleExecutable');
  assert(bundleIdentifier === 'com.fernandoabishai.scriptcut', `CFBundleIdentifier is ${bundleIdentifier}`);
  assert(shortVersion === productVersion, `CFBundleShortVersionString is ${shortVersion}, expected ${productVersion}`);
  assert(!/-alpha\./.test(shortVersion), 'prerelease identity entered CFBundleShortVersionString');

  const executablePath = path.join(appPath, 'Contents', 'MacOS', executableName);
  const environment = { ...process.env, SCRIPTCUT_IDENTITY_SMOKE: '1' };
  delete environment.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(executablePath, [], {
    cwd: root,
    env: environment,
    encoding: 'utf8',
    timeout: 30000,
  });
  if (result.error || result.status !== 0) {
    fail(`packaged app identity probe failed: ${(result.error?.message || result.stderr || result.stdout || '').trim()}`);
  }
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  const line = output.split(/\r?\n/).find((entry) => entry.startsWith('SCRIPTCUT_IDENTITY_SMOKE_RESULT='));
  assert(line, 'packaged app did not report the app.getVersion() identity probe');
  let appInfo;
  try {
    appInfo = JSON.parse(line.slice('SCRIPTCUT_IDENTITY_SMOKE_RESULT='.length));
  } catch (error) {
    fail(`app.getVersion() probe was not valid JSON: ${error.message}`);
  }
  assert(appInfo.packaged === true, 'app.getVersion() probe did not run in a packaged app');
  assert(appInfo.version === productVersion, `app.getVersion() is ${appInfo.version}, expected ${productVersion}`);

  console.log(`Packaged release identity passed: app.getVersion=${appInfo.version}, CFBundleIdentifier=${bundleIdentifier}, CFBundleShortVersionString=${shortVersion}, CFBundleVersion=${bundleVersion}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
