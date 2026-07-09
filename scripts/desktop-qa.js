#!/usr/bin/env node

const fs = require('fs');
const { spawnSync } = require('child_process');
const path = require('path');
const { resolvePythonRuntime } = require('../electron/python-runtime');

const root = path.join(__dirname, '..');
const includePackageBuild = process.argv.includes('--package');

function runStep(name, command, args, options = {}) {
  console.log(`\n==> ${name}`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: options.env || process.env,
  });

  if (result.error) {
    console.error(`\n${name} failed: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`\n${name} failed with exit code ${result.status}.`);
    process.exit(result.status || 1);
  }
}

function pythonArgs(args) {
  const runtime = resolvePythonRuntime();
  return {
    command: runtime.command,
    args: [...runtime.argsPrefix, ...args],
  };
}

const steps = [
  ['Environment doctor', 'npm', ['run', 'doctor']],
  ['Frontend lint', 'npm', ['run', 'lint']],
  ['Frontend production build', 'npm', ['run', 'build:frontend']],
  ['Backend smoke tests', 'npm', ['run', 'smoke:backend']],
  ['Clip draft smoke tests', 'npm', ['run', 'test:clip-drafts', '--prefix', 'frontend']],
  ['Transcript selection smoke tests', 'npm', ['run', 'test:transcript-selection', '--prefix', 'frontend']],
  ['Transcript search smoke tests', 'npm', ['run', 'test:transcript-search', '--prefix', 'frontend']],
  ['Speaker stats smoke tests', 'npm', ['run', 'test:speaker-stats', '--prefix', 'frontend']],
  ['Caption designer smoke tests', 'npm', ['run', 'test:caption-designer', '--prefix', 'frontend']],
  ['Social publishing smoke tests', 'npm', ['run', 'test:social-publishing', '--prefix', 'frontend']],
  ['Hook frame smoke tests', 'npm', ['run', 'test:hook-frames', '--prefix', 'frontend']],
  ['Playback sync smoke tests', 'npm', ['run', 'test:playback-sync', '--prefix', 'frontend']],
];

for (const [name, command, args] of steps) {
  runStep(name, command, args);
}

const compile = pythonArgs(['-m', 'compileall', '-q', 'backend']);
runStep('Backend Python compile', compile.command, compile.args);

if (includePackageBuild) {
  const cacheRoot = path.join(root, '.cache');
  const electronCache = path.join(cacheRoot, 'electron');
  const electronBuilderCache = path.join(cacheRoot, 'electron-builder');
  fs.mkdirSync(electronCache, { recursive: true });
  fs.mkdirSync(electronBuilderCache, { recursive: true });
  runStep('Electron unpacked app build', 'npm', ['run', 'dist:dir'], {
    env: {
      ...process.env,
      ELECTRON_CACHE: electronCache,
      ELECTRON_BUILDER_CACHE: electronBuilderCache,
    },
  });
}

console.log('\nDesktop QA checks passed.');
