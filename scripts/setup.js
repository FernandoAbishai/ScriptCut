#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const isWindows = process.platform === 'win32';
const venvDir = process.env.SCRIPTCUT_VENV_DIR || '.venv';
const venvPath = path.join(root, venvDir);
const venvPython = isWindows
  ? path.join(venvPath, 'Scripts', 'python.exe')
  : path.join(venvPath, 'bin', 'python');

function run(command, args, options = {}) {
  console.log(`\n$ ${[command, ...args].join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: isWindows,
    ...options,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function commandExists(command, args = ['--version']) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'ignore',
    shell: isWindows,
  });
  return result.status === 0;
}

function resolvePythonCommand() {
  if (process.env.SCRIPTCUT_PYTHON_PATH) return process.env.SCRIPTCUT_PYTHON_PATH;
  const candidates = isWindows ? ['py -3.11', 'py -3.12', 'py -3.10', 'python'] : ['python3.11', 'python3.12', 'python3.10', 'python3'];
  for (const candidate of candidates) {
    const [command, ...args] = candidate.split(' ');
    if (commandExists(command, [...args, '--version'])) return candidate;
  }
  throw new Error('Python 3.10-3.12 was not found. Install Python 3.11 or set SCRIPTCUT_PYTHON_PATH.');
}

function runPython(pythonCommand, args) {
  const [command, ...prefix] = pythonCommand.split(' ');
  run(command, [...prefix, ...args]);
}

function main() {
  const backendOnly = process.argv.includes('--backend-only');
  console.log('Setting up ScriptCut development environment.');

  if (!backendOnly) {
    run('npm', ['install']);
    run('npm', ['install'], { cwd: path.join(root, 'frontend') });
  }

  if (!fs.existsSync(venvPython)) {
    const pythonCommand = resolvePythonCommand();
    runPython(pythonCommand, ['-m', 'venv', venvDir]);
  }

  run(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip']);
  run(venvPython, ['-m', 'pip', 'install', '-r', 'requirements.txt'], {
    cwd: path.join(root, 'backend'),
  });

  console.log(backendOnly ? '\nBackend setup complete. Run npm run doctor.' : '\nSetup complete. Run npm run doctor, then npm run dev.');
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
