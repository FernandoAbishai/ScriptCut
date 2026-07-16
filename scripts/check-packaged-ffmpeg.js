#!/usr/bin/env node

/** Verify the architecture-matched FFmpeg bundle survived Electron packaging. */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const supportedArchitectures = new Set(['arm64', 'x64']);

function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function targetArchitecture() {
  return optionValue('--arch') || process.env.SCRIPTCUT_BUILD_ARCH || process.arch;
}

function fail(message) {
  console.error(`Packaged FFmpeg check failed: ${message}`);
  process.exit(1);
}

function findAppBundles(directory) {
  if (!fs.existsSync(directory)) return [];
  const bundles = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (!entry.isDirectory()) continue;
    if (entry.name.endsWith('.app')) {
      bundles.push(entryPath);
      continue;
    }
    bundles.push(...findAppBundles(entryPath));
  }
  return bundles;
}

function newestApp(arch) {
  const distDir = path.join(root, 'dist');
  const preferred = findAppBundles(path.join(distDir, `mac-${arch}`));
  const candidates = preferred.length > 0 ? preferred : findAppBundles(distDir);
  if (candidates.length === 0) {
    fail(`could not find an unpacked .app under ${path.relative(root, distDir)}.`);
  }
  return candidates.sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)[0];
}

function run(filePath, args) {
  const result = spawnSync(filePath, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) {
    fail(`${path.basename(filePath)} inside the app could not run: ${(result.error?.message || result.stderr || result.stdout || '').trim()}`);
  }
}

function main() {
  if (process.platform !== 'darwin') {
    fail('this verification is only applicable to a macOS app package.');
  }

  const arch = targetArchitecture();
  if (!supportedArchitectures.has(arch)) {
    fail(`unsupported architecture "${arch}". Expected arm64 or x64.`);
  }

  const appPath = newestApp(arch);
  const bundleDir = path.join(appPath, 'Contents', 'Resources', 'bin', `darwin-${arch}`);
  const manifestPath = path.join(bundleDir, 'bundle-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    fail(`missing ${path.relative(root, manifestPath)}.`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.platform !== 'darwin' || manifest.arch !== arch) {
    fail(`packaged manifest is for ${manifest.platform || 'unknown'}-${manifest.arch || 'unknown'}, not darwin-${arch}.`);
  }

  for (const tool of ['ffmpeg', 'ffprobe']) {
    const toolPath = path.join(bundleDir, tool);
    try {
      fs.accessSync(toolPath, fs.constants.X_OK);
    } catch {
      fail(`missing executable ${path.relative(root, toolPath)}.`);
    }
    run(toolPath, ['-version']);
  }

  console.log(`Packaged FFmpeg verified: ${path.relative(root, appPath)} (${arch}).`);
}

main();
