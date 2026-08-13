#!/usr/bin/env node

const assert = require('assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const buildDir = path.join(root, 'build');
const sourceSvg = path.join(root, 'frontend', 'public', 'brand', 'scriptcut-mark.svg');
const buildSvg = path.join(buildDir, 'icon.svg');
const outputIcns = path.join(buildDir, 'icon.icns');

const iconSizes = [16, 32, 128, 256, 512];
const iconsetEntries = iconSizes.flatMap((size) => [
  [`icon_${size}x${size}.png`, size],
  [`icon_${size}x${size}@2x.png`, size * 2],
]);

function fail(message) {
  throw new Error(`Icon generation failed: ${message}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) fail(`${command} is unavailable: ${result.error.message}`);
  if (result.status !== 0) {
    fail(`${command} ${args.join(' ')} failed: ${(result.stderr || result.stdout || '').trim()}`);
  }
  return result;
}

function commandExists(command) {
  const result = spawnSync('sh', ['-c', `command -v ${command}`], { cwd: root, encoding: 'utf8' });
  return result.status === 0;
}

function assertPrerequisites() {
  for (const command of ['rsvg-convert', 'magick', 'iconutil']) {
    if (!commandExists(command)) fail(`${command} is required for canonical macOS icon generation`);
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function parseIdentify(filePath) {
  const result = run('magick', ['identify', '-format', '%w|%h|%[channels]|%[colorspace]|%[opaque]|%[fx:mean]\n', filePath]);
  const [width, height, channels, colorspace, opaque, mean] = result.stdout.trim().split('|');
  return { width: Number(width), height: Number(height), channels, colorspace, opaque: opaque === 'true', mean: Number(mean) };
}

function renderCanonicalSvg(outputPath) {
  if (!commandExists('rsvg-convert')) {
    fail('rsvg-convert is required for faithful SVG gradients/transparency; install librsvg with Homebrew');
  }
  run('rsvg-convert', [
    '--format', 'png',
    '--width', '1024',
    '--height', '1024',
    '--keep-aspect-ratio',
    '--output', outputPath,
    sourceSvg,
  ], { stdio: 'inherit' });
  const metadata = parseIdentify(outputPath);
  assert.equal(metadata.width, 1024, 'canonical raster width must be 1024');
  assert.equal(metadata.height, 1024, 'canonical raster height must be 1024');
  assert.match(metadata.channels, /a/i, 'canonical raster must contain an alpha channel');
  assert.equal(metadata.colorspace, 'sRGB', 'canonical raster must be sRGB');
  assert.equal(metadata.opaque, false, 'canonical raster must preserve transparent corners');
  return metadata;
}

function assertCanonicalColorIdentity(rasterPath) {
  const histogram = run('magick', [rasterPath, '-alpha', 'on', '-format', '%c', 'histogram:info:-']).stdout;
  const pixels = histogram
    .split('\n')
    .map((line) => line.match(/^\s*(\d+): \((\d+),(\d+),(\d+),/))
    .filter(Boolean)
    .map((match) => ({ count: Number(match[1]), red: Number(match[2]), green: Number(match[3]), blue: Number(match[4]) }));
  const total = pixels.reduce((sum, pixel) => sum + pixel.count, 0);
  const nonGray = pixels.filter(({ red, green, blue }) => Math.max(red, green, blue) - Math.min(red, green, blue) >= 24)
    .reduce((sum, pixel) => sum + pixel.count, 0);
  const purple = pixels.filter(({ red, green, blue }) => blue > red && red > green && blue - green >= 35)
    .reduce((sum, pixel) => sum + pixel.count, 0);
  const indigo = pixels.filter(({ red, green, blue }) => blue >= 120 && blue > red * 1.12 && blue > green * 1.12)
    .reduce((sum, pixel) => sum + pixel.count, 0);
  const teal = pixels.filter(({ red, green, blue }) => green >= 90 && blue >= 90 && green > red * 1.35)
    .reduce((sum, pixel) => sum + pixel.count, 0);
  const blackWhiteFallback = pixels.filter(({ red, green, blue }) =>
    (red < 24 && green < 24 && blue < 24) || (red > 232 && green > 232 && blue > 232))
    .reduce((sum, pixel) => sum + pixel.count, 0);

  assert.ok(total > 0, 'canonical raster histogram is empty');
  assert.ok(nonGray / total >= 0.15, 'canonical raster is unexpectedly grayscale');
  assert.ok(purple / total >= 0.08, 'canonical purple identity is missing');
  assert.ok(indigo / total >= 0.08, 'canonical indigo identity is missing');
  assert.ok(teal / total >= 0.03, 'canonical teal identity is missing');
  assert.ok(blackWhiteFallback / total < 0.65, 'canonical raster is predominantly a black/white fallback');

  return {
    purple: purple / total,
    indigo: indigo / total,
    teal: teal / total,
    nonGray: nonGray / total,
    blackWhiteFallback: blackWhiteFallback / total,
  };
}

function renderIconset(canonicalRasterPath, iconsetPath) {
  fs.mkdirSync(iconsetPath, { recursive: true });
  for (const [filename, dimension] of iconsetEntries) {
    const outputPath = path.join(iconsetPath, filename);
    run('magick', [
      canonicalRasterPath,
      '-background', 'none',
      '-alpha', 'on',
      '-colorspace', 'sRGB',
      '-filter', 'Lanczos',
      '-resize', `${dimension}x${dimension}!`,
      '-strip',
      '-define', 'png:color-type=6',
      `PNG32:${outputPath}`,
    ]);
    const metadata = parseIdentify(outputPath);
    assert.equal(metadata.width, dimension, `${filename} width must be ${dimension}`);
    assert.equal(metadata.height, dimension, `${filename} height must be ${dimension}`);
    assert.match(metadata.channels, /a/i, `${filename} must contain an alpha channel`);
    assert.equal(metadata.colorspace, 'sRGB', `${filename} must be sRGB`);
  }
}

function buildIcns(iconsetPath) {
  run('iconutil', ['-c', 'icns', iconsetPath, '-o', outputIcns], { stdio: 'inherit' });
  assert.ok(fs.existsSync(outputIcns), 'iconutil did not produce build/icon.icns');
}

function roundTripIcns(extractedIconsetPath, canonicalRasterPath) {
  run('iconutil', ['-c', 'iconset', outputIcns, '-o', extractedIconsetPath], { stdio: 'inherit' });
  const extracted1024 = path.join(extractedIconsetPath, 'icon_512x512@2x.png');
  assert.ok(fs.existsSync(extracted1024), 'round-trip iconset is missing icon_512x512@2x.png');
  const comparison = spawnSync('magick', ['compare', '-metric', 'AE', canonicalRasterPath, extracted1024, 'null:'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (comparison.error) fail(`magick compare is unavailable: ${comparison.error.message}`);
  const comparisonOutput = (comparison.stderr || comparison.stdout || '').trim();
  const differingPixels = Number(comparisonOutput.match(/^([0-9]+(?:\.[0-9]+)?)/)?.[1]);
  assert.ok(Number.isFinite(differingPixels), `could not parse iconutil round-trip comparison: ${comparison.stderr || comparison.stdout}`);
  assert.equal(differingPixels, 0, 'iconutil round-trip 1024 raster differs from canonical raster');
  return { extracted1024, differingPixels };
}

function main() {
  assertPrerequisites();
  fs.mkdirSync(buildDir, { recursive: true });
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scriptcut-icon-generation-'));
  const canonicalRasterPath = path.join(temporaryRoot, 'icon-1024.png');
  const iconsetPath = path.join(temporaryRoot, 'icon.iconset');
  const extractedIconsetPath = path.join(temporaryRoot, 'extracted.iconset');
  try {
    const source = fs.readFileSync(sourceSvg);
    const build = fs.readFileSync(buildSvg);
    assert.equal(sha256(source), sha256(build), 'build/icon.svg must remain exactly synchronized with the canonical frontend mark');
    fs.copyFileSync(sourceSvg, buildSvg);

    const rasterMetadata = renderCanonicalSvg(canonicalRasterPath);
    const colorMetrics = assertCanonicalColorIdentity(canonicalRasterPath);
    renderIconset(canonicalRasterPath, iconsetPath);
    buildIcns(iconsetPath);
    const roundTrip = roundTripIcns(extractedIconsetPath, canonicalRasterPath);

    console.log('Canonical SVG source: frontend/public/brand/scriptcut-mark.svg');
    console.log(`Canonical 1024 raster: ${rasterMetadata.width}x${rasterMetadata.height} ${rasterMetadata.channels} ${rasterMetadata.colorspace}, transparent=${!rasterMetadata.opaque}`);
    console.log(`Color identity: purple=${colorMetrics.purple.toFixed(3)} indigo=${colorMetrics.indigo.toFixed(3)} teal=${colorMetrics.teal.toFixed(3)} nonGray=${colorMetrics.nonGray.toFixed(3)} blackWhiteFallback=${colorMetrics.blackWhiteFallback.toFixed(3)}`);
    console.log(`Generated iconset: ${iconsetEntries.map(([filename]) => filename).join(', ')}`);
    console.log(`Generated ${path.relative(root, outputIcns)} with iconutil; round-trip 1024 differing pixels=${roundTrip.differingPixels}`);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

module.exports = { assertCanonicalColorIdentity, iconsetEntries, parseIdentify };
