#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const strict = process.argv.includes('--strict');

function readPackage() {
  return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
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

function check(name, ok, detail, required = true) {
  return { name, ok, detail, required };
}

function hasEnv(...names) {
  return names.every((name) => !!process.env[name]);
}

function identityStatus() {
  if (process.platform !== 'darwin') {
    return check('Developer ID identity', false, 'Only checked on macOS.', false);
  }

  const result = run('security', ['find-identity', '-v', '-p', 'codesigning']);
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  const hasDeveloperId = /Developer ID Application:/i.test(output);
  return check(
    'Developer ID identity',
    hasDeveloperId,
    hasDeveloperId ? 'Developer ID Application identity found in keychain.' : 'No Developer ID Application identity found.',
    false,
  );
}

function main() {
  const pkg = readPackage();
  const iconPath = path.join(root, pkg.build?.mac?.icon || '');
  const hasApiKeyNotary = hasEnv('APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER');
  const hasAppleIdNotary = hasEnv('APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID');
  const hasCertificateFile = hasEnv('CSC_LINK', 'CSC_KEY_PASSWORD');
  const hasCertificateName = !!process.env.CSC_NAME;

  const checks = [
    check('Package author', !!pkg.author, pkg.author || 'Add package.json author for installer metadata.'),
    check('App icon config', !!pkg.build?.mac?.icon, pkg.build?.mac?.icon || 'Set build.mac.icon.'),
    check('App icon file', fs.existsSync(iconPath), path.relative(root, iconPath)),
    identityStatus(),
    check(
      'Signing certificate env',
      hasCertificateFile || hasCertificateName,
      hasCertificateFile
        ? 'CSC_LINK and CSC_KEY_PASSWORD are set.'
        : hasCertificateName
          ? 'CSC_NAME is set.'
          : 'Set CSC_LINK + CSC_KEY_PASSWORD, or CSC_NAME on the signing machine.',
      false,
    ),
    check(
      'Notarization env',
      hasApiKeyNotary || hasAppleIdNotary,
      hasApiKeyNotary
        ? 'App Store Connect API key notarization variables are set.'
        : hasAppleIdNotary
          ? 'Apple ID notarization variables are set.'
          : 'Set APPLE_API_KEY + APPLE_API_KEY_ID + APPLE_API_ISSUER, or APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID.',
      false,
    ),
  ];

  let failures = 0;
  for (const item of checks) {
    const marker = item.ok ? 'OK' : item.required || strict ? 'FAIL' : 'WARN';
    console.log(`[${marker}] ${item.name} - ${item.detail}`);
    if (!item.ok && (item.required || strict)) failures += 1;
  }

  if (failures > 0) {
    console.error(`\n${failures} release trust check${failures === 1 ? '' : 's'} failed.`);
    process.exit(1);
  }

  console.log('\nRelease trust checks completed.');
}

main();
