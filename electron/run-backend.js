const path = require('path');
const { spawn } = require('child_process');
const os = require('os');
const { resolveBackendLaunchPlan } = require('./runtime-contract');

function main() {
  const projectRoot = path.join(__dirname, '..');
  const launchPlan = resolveBackendLaunchPlan({
    runtimeMode: 'development',
    resourcesPath: projectRoot,
    projectRoot,
    userDataPath: process.env.SCRIPTCUT_USER_DATA_PATH || path.join(os.tmpdir(), 'scriptcut-dev'),
  });
  const args = [
    ...launchPlan.argsPrefix,
    '-m',
    'uvicorn',
    'main:app',
    '--host',
    '127.0.0.1',
    ...process.argv.slice(2),
  ];

  const child = spawn(launchPlan.command, args, {
    cwd: launchPlan.backendRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      ...launchPlan.environment,
      SCRIPTCUT_ALLOW_TOKENLESS_DEV: '1',
      PYTHONUNBUFFERED: '1',
    },
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
