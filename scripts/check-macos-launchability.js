#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const structuralErrorPatterns = [
  /code has no resources but signature indicates they must be present/i,
  /invalid signature/i,
  /resource envelope is obsolete/i,
  /sealed resource is missing or invalid/i,
  /code object is not signed/i,
  /CSSMERR_TP_CODE_SIGN/i,
];

function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(message) {
  throw new Error(`macOS launchability check failed: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    ...result,
    output: `${result.stdout || ''}${result.stderr || ''}`,
  };
}

function assertNativeArm64() {
  assert(process.platform === 'darwin' && process.arch === 'arm64', `requires native macOS arm64, received ${process.platform}-${process.arch}`);
}

function inspectSignature(appPath) {
  assert(fs.existsSync(appPath) && appPath.endsWith('.app'), `app does not exist: ${appPath}`);
  const strict = run('codesign', ['--verify', '--deep', '--strict', '--verbose=4', appPath]);
  if (strict.status !== 0) fail(`structural signature verification failed for ${appPath}: ${strict.output.trim()}`);

  const details = run('codesign', ['-dv', '--verbose=4', appPath]);
  if (details.status !== 0) fail(`could not inspect signature for ${appPath}: ${details.output.trim()}`);
  const output = details.output;
  assert(/Signature=adhoc/i.test(output), 'candidate signature is not explicitly ad-hoc');
  assert(!/Authority=(?:Developer ID|Apple Distribution|Apple Development|3rd Party Mac Developer)/i.test(output), 'Apple signing authority found');
  assert(!/TeamIdentifier=(?!not set\b)\S+/i.test(output), 'unexpected Apple TeamIdentifier found');
  assert(!/flags=.*\bruntime\b/i.test(output), 'Hardened Runtime flag found on ad-hoc candidate');
  return { strict, details, output };
}

function assessGatekeeper(appPath) {
  const assessment = run('spctl', ['--assess', '--type', 'execute', '--verbose=4', appPath]);
  const structuralError = structuralErrorPatterns.find((pattern) => pattern.test(assessment.output));
  if (structuralError) fail(`Gatekeeper reported structural signature corruption: ${structuralError}`);
  const policyOverride = /override=security disabled/i.test(assessment.output);
  const trusted = assessment.status === 0 && !policyOverride;
  assert(!trusted, 'ad-hoc candidate unexpectedly passed Apple trust policy');
  return { assessment, trusted, policyOverride };
}

function verifyApp(appPath) {
  assertNativeArm64();
  const signature = inspectSignature(appPath);
  return { signature, gatekeeper: assessGatekeeper(appPath) };
}

function verifyDmg(dmgPath) {
  assertNativeArm64();
  assert(fs.existsSync(dmgPath) && dmgPath.endsWith('.dmg'), `DMG does not exist: ${dmgPath}`);
  const verify = run('hdiutil', ['verify', dmgPath]);
  if (verify.status !== 0) fail(`DMG verification failed: ${verify.output.trim()}`);
  const mountPoint = fs.mkdtempSync(path.join(os.tmpdir(), 'scriptcut-launchability-'));
  let attached = false;
  try {
    const attach = run('hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mountPoint, dmgPath]);
    if (attach.status !== 0) fail(`DMG read-only mount failed: ${attach.output.trim()}`);
    attached = true;
    const appPath = path.join(mountPoint, 'ScriptCut.app');
    assert(fs.existsSync(appPath), 'DMG does not contain ScriptCut.app at its root');
    const result = verifyApp(appPath);
    return { ...result, appPath };
  } finally {
    if (attached) spawnSync('hdiutil', ['detach', mountPoint, '-force'], { cwd: root, encoding: 'utf8', stdio: 'ignore' });
    fs.rmSync(mountPoint, { recursive: true, force: true });
  }
}

function printSummary(label, result) {
  console.log(`${label}:`);
  console.log('  Structural signature: PASS');
  console.log('  Ad-hoc signature: Yes');
  console.log('  Developer ID: No');
  console.log('  Hardened Runtime: No');
  console.log('  Top-level strict verification: Passed');
  console.log('  Nested strict verification: Passed');
  console.log('  Apple trust: NOT TRUSTED');
  if (result.gatekeeper.policyOverride) console.log('  Gatekeeper policy override: security disabled (diagnostic is not Apple trust)');
  console.log(`  Gatekeeper diagnostic exit: ${result.gatekeeper.assessment.status}`);
}

function main() {
  const appPath = optionValue('--app') ? path.resolve(optionValue('--app')) : null;
  const dmgPath = optionValue('--dmg') ? path.resolve(optionValue('--dmg')) : null;
  if (!appPath && !dmgPath) fail('provide --app or --dmg');
  assertNativeArm64();
  if (appPath) printSummary('Pre-DMG app launchability', verifyApp(appPath));
  if (dmgPath) printSummary('Mounted DMG app launchability', verifyDmg(dmgPath));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

module.exports = { assessGatekeeper, inspectSignature, verifyApp, verifyDmg };
