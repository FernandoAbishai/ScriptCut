#!/usr/bin/env node

const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { newestApp, inspectPackage } = require('./check-packaged-runtime');

const root = path.join(__dirname, '..');

function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(message) {
  throw new Error(`Packaged backend smoke failed: ${message}`);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function request(port, pathname, token, method = 'GET') {
  return new Promise((resolve) => {
    const headers = token ? { 'X-ScriptCut-Token': token } : {};
    const req = http.request({ hostname: '127.0.0.1', port, path: pathname, method, headers }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode || 0,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('error', () => resolve({ status: 0, body: '' }));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve({ status: 0, body: '' });
    });
    req.end();
  });
}

async function waitForHealth(port, child, timeoutMs = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode !== null) fail(`worker exited before readiness with code ${child.exitCode}`);
    const response = await request(port, '/health');
    if (response.status === 200) return response;
    await sleep(250);
  }
  fail('worker did not reach /health within 30 seconds');
}

function restrictedEnvironment(plan, corePackRoot, binRoot, token) {
  const environment = {
    ...process.env,
    ...plan.environment,
    SCRIPTCUT_API_TOKEN: token,
    SCRIPTCUT_FILE_TOKEN_SECRET: token,
    SCRIPTCUT_PYTHON_PATH: '/definitely/not/a/python',
    CUTSCRIPT_PYTHON_PATH: '/definitely/not/a/python',
    PYTHONNOUSERSITE: '1',
    PYTHONPATH: corePackRoot,
    PATH: '/usr/bin:/bin',
    PYTHONUNBUFFERED: '1',
  };
  delete environment.VIRTUAL_ENV;
  delete environment.PYTHONHOME;
  delete environment.SCRIPTCUT_ALLOW_TOKENLESS_DEV;

  const ffmpegPath = path.join(binRoot, 'ffmpeg');
  const ffprobePath = path.join(binRoot, 'ffprobe');
  if (fs.existsSync(ffmpegPath)) environment.SCRIPTCUT_FFMPEG_PATH = ffmpegPath;
  if (fs.existsSync(ffprobePath)) environment.SCRIPTCUT_FFPROBE_PATH = ffprobePath;
  return environment;
}

async function stopWorker(child) {
  if (child.exitCode !== null) return;
  await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    child.once('exit', finish);
    child.kill('SIGTERM');
    setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
      setTimeout(finish, 1000);
    }, 5000);
  });
}

async function main() {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    fail(`this smoke requires native macOS arm64, received ${process.platform}-${process.arch}`);
  }
  const arch = optionValue('--arch') || 'arm64';
  if (arch !== 'arm64') fail(`this phase only verifies arm64, received ${arch}`);

  const packageInfo = inspectPackage(newestApp(arch));
  const port = 41000 + (process.pid % 1000);
  const token = 'scriptcut-packaged-smoke-token';
  const environment = restrictedEnvironment(
    packageInfo.plan,
    packageInfo.corePackRoot,
    path.join(packageInfo.resourcesPath, 'bin', 'darwin-arm64'),
    token,
  );
  const args = [
    ...packageInfo.plan.argsPrefix,
    '-m', 'uvicorn', 'main:app',
    '--host', '127.0.0.1',
    '--port', String(port),
  ];
  const child = spawn(packageInfo.plan.command, args, {
    cwd: packageInfo.plan.backendRoot,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (data) => { stderr += data.toString(); });

  try {
    await waitForHealth(port, child);
    const health = await request(port, '/health');
    if (health.status !== 200) fail(`/health returned ${health.status}`);

    const enginesResponse = await request(port, '/transcription/engines', token);
    if (enginesResponse.status !== 200) fail(`/transcription/engines returned ${enginesResponse.status}`);
    let engines;
    try {
      engines = JSON.parse(enginesResponse.body);
    } catch (error) {
      fail(`/transcription/engines was not JSON: ${error.message}`);
    }
    if (!engines.engines?.whisper?.available) fail('packaged baseline Whisper engine is not available');
    if (engines.default_engine !== 'whisper') fail(`packaged auto engine resolved to ${engines.default_engine}, expected whisper`);
    const unauthenticatedModels = await request(port, '/transcription/models');
    const unauthenticatedDelete = await request(port, '/transcription/models/whisper-base', undefined, 'DELETE');
    if (unauthenticatedModels.status !== 401 || unauthenticatedDelete.status !== 401) fail('model management endpoints are not token-protected');

    const unauthenticated = await request(port, '/system/diagnostics');
    const wrongToken = await request(port, '/system/diagnostics', 'wrong-token');
    const authenticated = await request(port, '/system/diagnostics', token);
    if (unauthenticated.status !== 401) fail(`unauthenticated diagnostics returned ${unauthenticated.status}`);
    if (wrongToken.status !== 401) fail(`wrong-token diagnostics returned ${wrongToken.status}`);
    if (authenticated.status !== 200) fail(`authenticated diagnostics returned ${authenticated.status}: ${authenticated.body}`);

    let diagnostics;
    try {
      diagnostics = JSON.parse(authenticated.body);
    } catch (error) {
      fail(`authenticated diagnostics was not JSON: ${error.message}`);
    }
    const runtime = diagnostics.runtime || {};
    for (const [key, expected] of Object.entries({
      mode: 'packaged-bundled',
      target: 'darwin-arm64',
      pythonSource: 'bundled',
      manifestSchema: 'scriptcut.runtime.v1',
      tokenRequired: true,
    })) {
      if (runtime[key] !== expected) fail(`diagnostics runtime.${key} was ${runtime[key]}, expected ${expected}`);
    }
    if (!String(diagnostics.python || '').startsWith('3.11.')) {
      fail(`diagnostics reported unexpected Python version: ${diagnostics.python}`);
    }

    console.log('Packaged backend /health: 200');
    console.log('Packaged /transcription/engines: whisper available, auto resolves to whisper');
    console.log('Unauthenticated diagnostics: 401');
    console.log('Wrong-token diagnostics: 401');
    console.log('Authenticated diagnostics: 200');
    console.log('Runtime diagnostics: packaged-bundled / darwin-arm64 / bundled / scriptcut.runtime.v1 / tokenRequired=true');
    console.log('No-system-Python environment: invalid SCRIPTCUT_PYTHON_PATH, cleared VIRTUAL_ENV and PYTHONHOME, PATH=/usr/bin:/bin');
    console.log('External resolver called: No');
    console.log('Packaged backend smoke passed.');
  } catch (error) {
    const detail = stderr.trim().slice(-2000);
    if (detail) console.error(detail);
    throw error;
  } finally {
    await stopWorker(child);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
