#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const buildDir = path.join(root, 'build');
const sourceSvg = path.join(buildDir, 'icon.svg');
const outputIcns = path.join(buildDir, 'icon.icns');

const entries = [
  ['icp4', 16],
  ['icp5', 32],
  ['icp6', 64],
  ['ic07', 128],
  ['ic08', 256],
  ['ic09', 512],
  ['ic10', 1024],
];

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }
}

function writeUInt32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value, 0);
  return buffer;
}

function iconEntry(type, data) {
  return Buffer.concat([
    Buffer.from(type, 'ascii'),
    writeUInt32(data.length + 8),
    data,
  ]);
}

function main() {
  fs.mkdirSync(buildDir, { recursive: true });

  const chunks = [];
  for (const [type, size] of entries) {
    const pngPath = path.join(buildDir, `icon-${size}.png`);
    run('magick', [sourceSvg, '-resize', `${size}x${size}`, `PNG32:${pngPath}`]);
    chunks.push(iconEntry(type, fs.readFileSync(pngPath)));
  }

  const payload = Buffer.concat(chunks);
  fs.writeFileSync(outputIcns, Buffer.concat([
    Buffer.from('icns', 'ascii'),
    writeUInt32(payload.length + 8),
    payload,
  ]));

  console.log(`Generated ${path.relative(root, outputIcns)}`);
}

main();
