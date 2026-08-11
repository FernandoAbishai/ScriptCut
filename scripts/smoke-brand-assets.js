#!/usr/bin/env node

const assert = require('assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const iconPath = path.join(root, 'build', 'icon.svg');
const markPath = path.join(root, 'frontend', 'public', 'brand', 'scriptcut-mark.svg');
const wordmarkPath = path.join(root, 'frontend', 'public', 'brand', 'scriptcut-wordmark.svg');
const iconsetPath = path.join(root, 'build', 'icon.icns');
const readmePath = path.join(root, 'README.md');
const brandGuidePath = path.join(root, 'docs', 'brand', 'README.md');
const packagePath = path.join(root, 'package.json');

const canonicalIconHash = '7beaf89d2a2b6560c32cf45721a1fde684a8562e297cb1e90915495c43058389';
const canonicalIcon = fs.readFileSync(iconPath, 'utf8');
const mark = fs.readFileSync(markPath, 'utf8');
const wordmark = fs.readFileSync(wordmarkPath, 'utf8');
const iconset = fs.readFileSync(iconsetPath);
const readme = fs.readFileSync(readmePath, 'utf8');
const brandGuide = fs.readFileSync(brandGuidePath, 'utf8');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

assert.equal(sha256(canonicalIcon), canonicalIconHash, 'build/icon.svg is not the approved historical vector');
assert.equal(mark, canonicalIcon, 'scriptcut-mark.svg must match build/icon.svg exactly');
for (const required of [
  'linearGradient',
  '#6d5dfc',
  '#4f46e5',
  '#13b8a7',
  'M292 706c90-36',
]) {
  assert.ok(wordmark.includes(required), `wordmark is missing canonical mark detail: ${required}`);
}
for (const stale of ['Transcript Slice', 'cutMaskSmall', '#0F1117', 'M174 86 L250 330']) {
  assert.doesNotMatch(wordmark, new RegExp(stale.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `wordmark contains stale brand geometry: ${stale}`);
}
assert.match(readme, /frontend\/public\/brand\/scriptcut-wordmark\.svg/);
assert.match(brandGuide, /canonical|primary/i);
assert.match(brandGuide, /purple\/indigo\/teal|purple\/teal/i);
assert.doesNotMatch(brandGuide, /primary ScriptCut mark is \*\*Transcript Slice\*\*/i);
assert.equal(packageJson.build?.mac?.icon, 'build/icon.icns');
assert.ok(iconset.length > 0 && iconset.subarray(0, 4).toString('ascii') === 'icns', 'build/icon.icns is missing or invalid');
for (const entry of ['icp4', 'icp5', 'icp6', 'ic07', 'ic08', 'ic09', 'ic10']) {
  assert.ok(iconset.includes(Buffer.from(entry)), `build/icon.icns is missing ${entry}`);
}

console.log('Canonical ScriptCut brand asset smoke passed.');
