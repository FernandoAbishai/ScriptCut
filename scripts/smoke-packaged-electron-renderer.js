#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');

function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(message) {
  throw new Error(`Packaged Electron renderer smoke failed: ${message}`);
}

function appExecutable(appPath) {
  const macOsPath = path.join(appPath, 'Contents', 'MacOS');
  if (!fs.existsSync(macOsPath)) fail(`missing ${macOsPath}`);
  const executables = fs.readdirSync(macOsPath)
    .map((name) => path.join(macOsPath, name))
    .filter((filePath) => fs.statSync(filePath).isFile());
  if (executables.length !== 1) fail(`expected one packaged executable, found ${executables.length}`);
  return executables[0];
}

function createMediaFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'scriptcut-renderer-media-'));
  const filePath = path.join(directory, 'renderer-transport.mp4');
  fs.writeFileSync(filePath, Buffer.from('000000186674797069736f6d00000200', 'hex'));
  return { directory, filePath };
}

function run(appPath, mediaPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(appExecutable(appPath), [], {
      cwd: root,
      env: {
        ...process.env,
        SCRIPTCUT_RENDERER_SMOKE: '1',
        SCRIPTCUT_RENDERER_SMOKE_MEDIA_PATH: mediaPath,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let settled = false;
    let timeoutId;
    const stopChild = () => {
      if (child.exitCode === null) child.kill('SIGTERM');
    };
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      stopChild();
      if (error) reject(error);
      else resolve(result);
    };
    const consume = (chunk) => {
      output += chunk.toString();
      const line = output.split('\n').find((entry) => entry.startsWith('SCRIPTCUT_RENDERER_SMOKE_RESULT='));
      if (!line) return;
      try {
        finish(null, JSON.parse(line.slice('SCRIPTCUT_RENDERER_SMOKE_RESULT='.length)));
      } catch (error) {
        finish(new Error(`invalid renderer smoke result: ${error.message}`));
      }
    };
    child.stdout.on('data', consume);
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    child.on('error', (error) => finish(error));
    child.on('exit', (code, signal) => {
      if (settled) return;
      finish(new Error(`packaged app exited before renderer result (code=${code}, signal=${signal})\n${output.slice(-4000)}`));
    });
    timeoutId = setTimeout(() => {
      if (settled) return;
      finish(new Error(`renderer smoke timed out\n${output.slice(-4000)}`));
    }, 30000);
  });
}

async function main() {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    fail(`requires native macOS arm64, received ${process.platform}-${process.arch}`);
  }
  const appPath = path.resolve(optionValue('--app') || '');
  if (!appPath || !appPath.endsWith('.app')) fail('requires --app <ScriptCut.app>');
  const fixture = createMediaFixture();
  try {
    const result = await run(appPath, fixture.filePath);
    console.log(`Renderer GET /system/checks: ${result.checks.status} (token-injected authenticated response)`);
    console.log(`Renderer POST /jobs/transcribe: ${result.transcription.status} (HTTP response, no Failed to fetch)`);
    console.log(`Renderer media /file: ${result.media.status} (${result.media.bodyBytes} response bytes)`);
    console.log('Renderer CSP violations: none');
    console.log('Packaged Electron renderer transport smoke passed.');
  } finally {
    fs.rmSync(fixture.directory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
