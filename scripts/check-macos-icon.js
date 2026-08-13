#!/usr/bin/env node

const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const sourceSvg = path.join(root, 'frontend', 'public', 'brand', 'scriptcut-mark.svg');

function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(message) {
  throw new Error(`macOS icon check failed: ${message}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) fail(`${command} is unavailable: ${result.error.message}`);
  if (result.status !== 0) fail(`${command} ${args.join(' ')} failed: ${(result.stderr || result.stdout || '').trim()}`);
  return result;
}

function runCompare(left, right) {
  const result = spawnSync('magick', ['compare', '-metric', 'AE', left, right, 'null:'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.error) fail(`magick compare is unavailable: ${result.error.message}`);
  const output = (result.stderr || result.stdout || '').trim();
  const differingPixels = Number(output.match(/^([0-9]+(?:\.[0-9]+)?)/)?.[1]);
  if (!Number.isFinite(differingPixels)) fail(`could not parse pixel comparison: ${output}`);
  return differingPixels;
}

function renderCanonicalRaster(outputPath) {
  run('rsvg-convert', [
    '--format', 'png',
    '--width', '1024',
    '--height', '1024',
    '--keep-aspect-ratio',
    '--output', outputPath,
    sourceSvg,
  ], { stdio: 'inherit' });
  const identify = run('magick', ['identify', '-format', '%w|%h|%[channels]|%[colorspace]|%[opaque]\n', outputPath]);
  const [width, height, channels, colorspace, opaque] = identify.stdout.trim().split('|');
  assert.equal(Number(width), 1024, 'canonical raster width must be 1024');
  assert.equal(Number(height), 1024, 'canonical raster height must be 1024');
  assert.match(channels, /a/i, 'canonical raster must contain alpha');
  assert.equal(colorspace, 'sRGB', 'canonical raster must be sRGB');
  assert.equal(opaque, 'False', 'canonical raster must preserve transparency');
}

function iconDeclaration(appPath) {
  const infoPlist = path.join(appPath, 'Contents', 'Info.plist');
  assert.ok(fs.existsSync(infoPlist), 'Contents/Info.plist is missing');
  const result = run('plutil', ['-extract', 'CFBundleIconFile', 'raw', '-o', '-', infoPlist]);
  const declaration = result.stdout.trim();
  assert.ok(declaration, 'CFBundleIconFile is missing');
  return declaration.endsWith('.icns') ? declaration : `${declaration}.icns`;
}

function verifyIcns(icnsPath, canonicalRasterPath, label) {
  assert.ok(fs.existsSync(icnsPath), `${label} is missing: ${icnsPath}`);
  const header = fs.readFileSync(icnsPath).subarray(0, 4).toString('ascii');
  assert.equal(header, 'icns', `${label} is not an ICNS container`);
  const extractedParent = fs.mkdtempSync(path.join(os.tmpdir(), 'scriptcut-icon-extracted-'));
  const extracted = path.join(extractedParent, 'extracted.iconset');
  try {
    run('iconutil', ['-c', 'iconset', icnsPath, '-o', extracted], { stdio: 'inherit' });
    const expected = [
      'icon_16x16.png', 'icon_16x16@2x.png',
      'icon_32x32.png', 'icon_32x32@2x.png',
      'icon_128x128.png', 'icon_128x128@2x.png',
      'icon_256x256.png', 'icon_256x256@2x.png',
      'icon_512x512.png', 'icon_512x512@2x.png',
    ];
    for (const filename of expected) assert.ok(fs.existsSync(path.join(extracted, filename)), `${label} extraction is missing ${filename}`);
    const extracted1024 = path.join(extracted, 'icon_512x512@2x.png');
    const differingPixels = runCompare(canonicalRasterPath, extracted1024);
    assert.equal(differingPixels, 0, `${label} 1024 representation differs from canonical raster`);
    return { extracted1024, differingPixels };
  } finally {
    fs.rmSync(extractedParent, { recursive: true, force: true });
  }
}

function verifyPackagedApp(appPath) {
  if (process.platform !== 'darwin') fail(`requires macOS, received ${process.platform}`);
  const resolvedApp = path.resolve(appPath);
  assert.ok(resolvedApp.endsWith('.app') && fs.existsSync(resolvedApp), `app does not exist: ${resolvedApp}`);
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scriptcut-icon-check-'));
  const canonicalRaster = path.join(temporaryRoot, 'canonical-1024.png');
  try {
    renderCanonicalRaster(canonicalRaster);
    const declaration = iconDeclaration(resolvedApp);
    const resourceIcon = path.join(resolvedApp, 'Contents', 'Resources', declaration);
    const result = verifyIcns(resourceIcon, canonicalRaster, 'packaged app icon');
    console.log(`Info.plist CFBundleIconFile: ${declaration}`);
    console.log(`Resources icon: ${path.relative(root, resourceIcon)}`);
    console.log(`Packaged app canonical 1024 differing pixels: ${result.differingPixels}`);
    console.log('Packaged macOS app icon gate passed.');
    return { declaration, resourceIcon, ...result };
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

if (require.main === module) {
  try {
    const appPath = optionValue('--app');
    if (!appPath) fail('provide --app <ScriptCut.app>');
    verifyPackagedApp(appPath);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

module.exports = { verifyIcns, verifyPackagedApp };
