#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const packagePath = path.join(root, 'package.json');
const releaseConfigPath = path.join(root, 'electron-builder.release.cjs');
const forbiddenEntitlements = [
  'com.apple.security.get-task-allow',
  'com.apple.security.cs.disable-library-validation',
  'com.apple.security.cs.allow-dyld-environment-variables',
  'com.apple.security.cs.allow-unsigned-executable-memory',
];

function readPackage() {
  return JSON.parse(fs.readFileSync(packagePath, 'utf8'));
}

function run(command, args) {
  try {
    return spawnSync(command, args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    return { status: 1, stdout: '', stderr: error.message };
  }
}

function commandAvailable(command) {
  const result = run('sh', ['-c', `command -v ${command}`]);
  return result.status === 0;
}

function check(name, ok, detail, required = true) {
  return { name, ok, detail, required };
}

function envSet(...names) {
  return names.every((name) => typeof process.env[name] === 'string' && process.env[name] !== '');
}

function releaseConfig() {
  if (!fs.existsSync(releaseConfigPath)) return null;
  try {
    return require(releaseConfigPath);
  } catch (error) {
    throw new Error(`release config could not be loaded: ${error.message}`);
  }
}

function entitlementKeys(text) {
  return [...text.matchAll(/<key>([^<]+)<\/key>/g)].map((match) => match[1]);
}

function validateEntitlements(filePath) {
  if (!fs.existsSync(filePath)) return { ok: false, detail: 'file is missing' };
  const text = fs.readFileSync(filePath, 'utf8');
  const lint = process.platform === 'darwin' ? run('plutil', ['-lint', filePath]) : { status: 0 };
  if (lint.status !== 0) return { ok: false, detail: (lint.stderr || lint.stdout || 'invalid plist').trim() };
  const presentForbidden = forbiddenEntitlements.filter((key) => entitlementKeys(text).includes(key));
  if (presentForbidden.length > 0) return { ok: false, detail: `forbidden entitlement present: ${presentForbidden.join(', ')}` };
  if (!/<key>com\.apple\.security\.cs\.allow-jit<\/key>\s*<true\s*\/>/.test(text)) {
    return { ok: false, detail: 'Electron JIT entitlement is missing or not true' };
  }
  return { ok: true, detail: path.relative(root, filePath) };
}

function signingCredentialState() {
  const configuredCertificate = envSet('CSC_LINK', 'CSC_KEY_PASSWORD')
    || (process.env.CSC_NAME || '').includes('Developer ID Application');
  let discoverableIdentity = false;
  if (process.platform === 'darwin') {
    const result = run('security', ['find-identity', '-v', '-p', 'codesigning']);
    discoverableIdentity = /Developer ID Application:/i.test(`${result.stdout || ''}${result.stderr || ''}`);
  }
  return configuredCertificate || discoverableIdentity;
}

function notarizationCredentialState() {
  return (
    envSet('APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER')
    || envSet('APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID')
    || envSet('APPLE_KEYCHAIN', 'APPLE_KEYCHAIN_PROFILE')
  );
}

function commonChecks(pkg, config) {
  const entitlements = config?.mac?.entitlements ? path.join(root, config.mac.entitlements) : '';
  const inherited = config?.mac?.entitlementsInherit ? path.join(root, config.mac.entitlementsInherit) : '';
  const entitlementCheck = validateEntitlements(entitlements);
  const inheritedCheck = validateEntitlements(inherited);
  const target = JSON.stringify(config?.mac?.target || '');
  return [
    check('Native macOS arm64 host', process.platform === 'darwin' && process.arch === 'arm64', `${process.platform}-${process.arch}`),
    check('Package author', !!pkg.author, pkg.author || 'package.json author is missing'),
    check('App icon config', !!config?.mac?.icon, config?.mac?.icon || 'release config mac.icon is missing'),
    check('App icon file', !!config?.mac?.icon && fs.existsSync(path.join(root, config.mac.icon)), config?.mac?.icon || 'icon path is missing'),
    check('Release config target', target === JSON.stringify([{ target: 'dmg', arch: ['arm64'] }]), target),
    check('Hardened Runtime explicit', config?.mac?.hardenedRuntime === true, String(config?.mac?.hardenedRuntime)),
    check('Primary entitlements valid', entitlementCheck.ok, entitlementCheck.detail),
    check('Inherited entitlements valid', inheritedCheck.ok, inheritedCheck.detail),
    check('Portable runtime input', fs.existsSync(path.join(root, 'runtime', 'core-darwin-arm64-py311.txt')) && fs.existsSync(path.join(root, 'scripts', 'prepare-python-runtime.js')), 'runtime input and preparation script'),
    check('Trusted model input', fs.existsSync(path.join(root, 'runtime', 'models', 'whisper-base.json')), 'runtime/models/whisper-base.json'),
    check('FFmpeg preparation input', fs.existsSync(path.join(root, 'scripts', 'prepare-ffmpeg-bundle.js')), 'scripts/prepare-ffmpeg-bundle.js'),
    check('xcrun available', commandAvailable('xcrun'), 'xcrun command'),
    check('notarytool available', commandAvailable('xcrun') && run('xcrun', ['--find', 'notarytool']).status === 0, 'xcrun notarytool'),
    check('stapler available', commandAvailable('xcrun') && run('xcrun', ['--find', 'stapler']).status === 0, 'xcrun stapler'),
  ];
}

function candidateChecks(pkg, config) {
  return [
    ...commonChecks(pkg, config),
    check('Candidate skips implicit signing', config?.mac?.identity === null, `identity=${String(config?.mac?.identity)}`),
    check('Candidate skips notarization', config?.mac?.notarize === false, `notarize=${String(config?.mac?.notarize)}`),
  ];
}

function signedChecks(pkg, config) {
  return [
    ...commonChecks(pkg, config),
    check('Developer ID credentials configured', signingCredentialState(), 'safe boolean credential state'),
    check('Notarization credentials configured', notarizationCredentialState(), 'safe boolean credential state'),
    check('Signed packaging config is explicit', config?.mac?.identity !== null, '3B.5A release config is candidate-only; signed packaging belongs to 3B.5B'),
  ];
}

function main() {
  const mode = process.argv.includes('--candidate') ? 'candidate' : process.argv.includes('--signed') ? 'signed' : null;
  if (!mode) {
    console.error('Usage: node scripts/check-release-trust.js --candidate|--signed');
    process.exit(2);
  }

  const pkg = readPackage();
  const config = releaseConfig();
  const checks = mode === 'candidate' ? candidateChecks(pkg, config) : signedChecks(pkg, config);
  let failures = 0;
  for (const item of checks) {
    const marker = item.ok ? 'OK' : 'FAIL';
    console.log(`[${marker}] ${item.name} - ${item.detail}`);
    if (!item.ok && item.required) failures += 1;
  }

  console.log(`Developer ID credentials configured: ${signingCredentialState() ? 'Yes' : 'No'}`);
  console.log(`Notary credentials configured: ${notarizationCredentialState() ? 'Yes' : 'No'}`);
  console.log(`Release trust mode: ${mode}`);
  if (failures > 0) {
    console.error(`\n${failures} ${mode} release trust check${failures === 1 ? '' : 's'} failed.`);
    process.exit(1);
  }
  console.log(`\n${mode === 'candidate' ? 'Unsigned release-candidate' : 'Credentialed signed-release'} trust checks passed.`);
}

main();
