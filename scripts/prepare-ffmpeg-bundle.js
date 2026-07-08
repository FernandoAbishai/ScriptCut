#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const targetDir = path.join(root, 'build', 'bin', `${process.platform}-${process.arch}`);

function run(command, args) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function findCommand(command) {
  const lookup = process.platform === 'win32' ? 'where' : 'which';
  const result = run(lookup, [command]);
  if (result.status !== 0) return null;
  return (result.stdout || '').trim().split(/\r?\n/)[0] || null;
}

function copyExecutable(name) {
  const source = findCommand(name);
  if (!source) {
    throw new Error(`${name} was not found in PATH. Install FFmpeg before preparing the release bundle.`);
  }
  fs.mkdirSync(targetDir, { recursive: true });
  const targetName = process.platform === 'win32' && !name.endsWith('.exe') ? `${name}.exe` : name;
  const target = path.join(targetDir, targetName);
  fs.copyFileSync(source, target);
  fs.chmodSync(target, 0o755);
  console.log(`Bundled ${name}: ${path.relative(root, target)}`);
}

function main() {
  copyExecutable('ffmpeg');
  copyExecutable('ffprobe');
}

main();
