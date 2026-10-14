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
  throw new Error(`Signed macOS release check failed: ${message}`);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { ...result, output: `${result.stdout || ''}${result.stderr || ''}` };
}

function requireSuccess(command, args, label) {
  const result = run(command, args);
  if (result.error || result.status !== 0) {
    fail(`${label}: ${(result.error?.message || result.output || 'command failed').trim()}`);
  }
  return result;
}

function verifyApp(appPath) {
  if (!fs.existsSync(appPath) || !appPath.endsWith('.app')) fail(`app does not exist: ${appPath}`);
  requireSuccess('codesign', ['--verify', '--deep', '--strict', '--verbose=4', appPath], 'codesign verification failed');
  const details = requireSuccess('codesign', ['-dv', '--verbose=4', appPath], 'could not inspect code signature').output;
  if (!/Authority=Developer ID Application:/i.test(details)) fail('Developer ID Application authority is missing');
  const teamIdentifier = details.match(/TeamIdentifier=([^\s]+)/i)?.[1];
  if (!teamIdentifier || teamIdentifier === 'not') fail('Developer ID TeamIdentifier is missing');
  if (!/flags=.*\bruntime\b/i.test(details)) fail('Hardened Runtime flag is missing');
  requireSuccess('spctl', ['--assess', '--type', 'execute', '--verbose=4', appPath], 'Gatekeeper assessment failed');
  requireSuccess('xcrun', ['stapler', 'validate', appPath], 'notarization staple validation failed');
  return { teamIdentifier };
}

function verifyDmg(dmgPath) {
  if (!fs.existsSync(dmgPath) || !dmgPath.endsWith('.dmg')) fail(`DMG does not exist: ${dmgPath}`);
  requireSuccess('hdiutil', ['verify', dmgPath], 'DMG integrity verification failed');
  const mountPoint = fs.mkdtempSync(path.join(os.tmpdir(), 'scriptcut-signed-release-'));
  let attached = false;
  try {
    requireSuccess('hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mountPoint, dmgPath], 'DMG mount failed');
    attached = true;
    const appPath = path.join(mountPoint, 'ScriptCut.app');
    if (!fs.existsSync(appPath)) fail('DMG does not contain ScriptCut.app at its root');
    return verifyApp(appPath);
  } finally {
    if (attached) spawnSync('hdiutil', ['detach', mountPoint, '-force'], { cwd: root, stdio: 'ignore' });
    fs.rmSync(mountPoint, { recursive: true, force: true });
  }
}

function main() {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    fail(`requires native macOS arm64, received ${process.platform}-${process.arch}`);
  }
  const appPath = optionValue('--app');
  const dmgPath = optionValue('--dmg');
  if (!appPath && !dmgPath) fail('provide --app and/or --dmg');
  let result = null;
  if (appPath) result = verifyApp(path.resolve(appPath));
  if (dmgPath) result = verifyDmg(path.resolve(dmgPath));
  console.log(`Developer ID TeamIdentifier: ${result?.teamIdentifier || 'verified'}`);
  console.log('App Developer ID signature: PASS');
  console.log('App Hardened Runtime: PASS');
  console.log('App Gatekeeper assessment: PASS');
  console.log('App notarization staple: PASS');
  if (dmgPath) console.log('DMG container integrity: PASS');
  console.log('Signed macOS release verification passed.');
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

module.exports = { verifyApp, verifyDmg };
