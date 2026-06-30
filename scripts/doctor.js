#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { resolvePythonRuntime } = require('../electron/python-runtime');

const root = path.join(__dirname, '..');

function run(command, args, options = {}) {
  try {
    return spawnSync(command, args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    });
  } catch (error) {
    return { status: 1, stdout: '', stderr: error.message };
  }
}

function firstLine(value) {
  return String(value || '').trim().split(/\r?\n/)[0] || '';
}

function check(name, fn, required = true) {
  try {
    const result = fn();
    const ok = !!result.ok;
    return { name, required, ok, detail: result.detail || '' };
  } catch (error) {
    return { name, required, ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

const checks = [
  check('Node.js 18+', () => {
    const major = Number(process.versions.node.split('.')[0]);
    return {
      ok: major >= 18,
      detail: `found ${process.version}`,
    };
  }),
  check('Root dependencies', () => ({
    ok: fs.existsSync(path.join(root, 'node_modules')),
    detail: fs.existsSync(path.join(root, 'node_modules')) ? 'node_modules found' : 'run npm install',
  })),
  check('Frontend dependencies', () => ({
    ok: fs.existsSync(path.join(root, 'frontend', 'node_modules')),
    detail: fs.existsSync(path.join(root, 'frontend', 'node_modules')) ? 'frontend/node_modules found' : 'run npm install --prefix frontend',
  })),
  check('Python 3.10-3.12 runtime', () => {
    const runtime = resolvePythonRuntime();
    const version = run(runtime.command, [...runtime.argsPrefix, '--version']);
    return {
      ok: version.status === 0,
      detail: `${runtime.command} ${runtime.argsPrefix.join(' ')} ${firstLine(version.stdout || version.stderr)}`.trim(),
    };
  }),
  check('Backend dependencies', () => {
    const runtime = resolvePythonRuntime();
    const result = run(runtime.command, [...runtime.argsPrefix, '-c', 'import fastapi, uvicorn, pydantic']);
    return {
      ok: result.status === 0,
      detail: result.status === 0 ? 'FastAPI runtime imports ok' : 'run npm run setup:backend',
    };
  }),
  check('FFmpeg in PATH', () => {
    const result = run('ffmpeg', ['-version']);
    return {
      ok: result.status === 0,
      detail: result.status === 0 ? firstLine(result.stdout) : 'install ffmpeg and ensure it is in PATH',
    };
  }),
  check('Backend smoke tests', () => {
    const result = run('npm', ['run', 'smoke:backend']);
    return {
      ok: result.status === 0,
      detail: result.status === 0 ? 'smoke checks passed' : firstLine(result.stderr || result.stdout),
    };
  }),
  check('Ollama local AI', () => {
    const result = run('curl', ['-s', '--max-time', '2', 'http://127.0.0.1:11434/api/tags']);
    return {
      ok: result.status === 0,
      detail: result.status === 0 ? 'Ollama reachable' : 'optional; start Ollama for local AI',
    };
  }, false),
];

let failures = 0;
for (const item of checks) {
  const mark = item.ok ? 'OK' : item.required ? 'FAIL' : 'SKIP';
  console.log(`[${mark}] ${item.name}${item.detail ? ` - ${item.detail}` : ''}`);
  if (!item.ok && item.required) failures += 1;
}

if (failures > 0) {
  console.error(`\n${failures} required check${failures === 1 ? '' : 's'} failed.`);
  process.exit(1);
}

console.log('\nScriptCut environment looks ready.');
