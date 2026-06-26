const path = require('path');
const { spawn } = require('child_process');
const { resolvePythonRuntime } = require('./python-runtime');

const backendDir = path.join(__dirname, '..', 'backend');

function main() {
  const { command, argsPrefix } = resolvePythonRuntime();
  const args = [
    ...argsPrefix,
    '-m',
    'uvicorn',
    'main:app',
    '--host',
    '127.0.0.1',
    ...process.argv.slice(2),
  ];

  const child = spawn(command, args, {
    cwd: backendDir,
    stdio: 'inherit',
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });

  child.on('error', (error) => {
    console.error(`[backend] Failed to start Python backend: ${error.message}`);
    process.exit(1);
  });
}

main();
