#!/usr/bin/env node

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { newestApp, inspectPackage } = require('./check-packaged-runtime');

const root = path.join(__dirname, '..');

function fail(message) {
  throw new Error(`Packaged optional-capability smoke failed: ${message}`);
}

function request(port, method, pathname, token, payload) {
  return new Promise((resolve) => {
    const body = payload ? JSON.stringify(payload) : '';
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      method,
      path: pathname,
      headers: {
        ...(token ? { 'X-ScriptCut-Token': token } : {}),
        ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}),
      },
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode || 0, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', () => resolve({ status: 0, body: '' }));
    req.setTimeout(1500, () => { req.destroy(); resolve({ status: 0, body: '' }); });
    if (body) req.write(body);
    req.end();
  });
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function workerEnvironment(packageInfo, modelRoot, token) {
  const binRoot = path.join(packageInfo.resourcesPath, 'bin', 'darwin-arm64');
  return {
    ...process.env,
    ...packageInfo.plan.environment,
    SCRIPTCUT_API_TOKEN: token,
    SCRIPTCUT_FILE_TOKEN_SECRET: token,
    SCRIPTCUT_MODEL_ROOT: modelRoot,
    SCRIPTCUT_PYTHON_PATH: '/definitely/not/a/python',
    CUTSCRIPT_PYTHON_PATH: '/definitely/not/a/python',
    PYTHONNOUSERSITE: '1',
    PYTHONPATH: packageInfo.corePackRoot,
    PATH: `${binRoot}:/usr/bin:/bin`,
    SCRIPTCUT_FFMPEG_PATH: path.join(binRoot, 'ffmpeg'),
    SCRIPTCUT_FFPROBE_PATH: path.join(binRoot, 'ffprobe'),
    PYTHONUNBUFFERED: '1',
  };
}

async function waitForHealth(port, child) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30000) {
    if (child.exitCode !== null) fail(`worker exited before readiness with code ${child.exitCode}`);
    if ((await request(port, 'GET', '/health')).status === 200) return;
    await sleep(250);
  }
  fail('worker did not reach /health');
}

async function waitForFailedJob(port, token, jobId) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15000) {
    const response = await request(port, 'GET', `/jobs/${jobId}`, token);
    if (response.status !== 200) fail(`optional job poll returned ${response.status}`);
    const job = JSON.parse(response.body);
    if (job.status === 'failed') return job;
    if (job.status === 'succeeded') fail('optional capability unexpectedly succeeded');
    await sleep(250);
  }
  fail('optional capability job did not fail cleanly');
}

async function main() {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') fail(`requires native macOS arm64, received ${process.platform}-${process.arch}`);
  const packageInfo = inspectPackage(newestApp('arm64'));
  const token = 'scriptcut-packaged-optional-token';
  const modelRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scriptcut-phase-3b4-optional-models-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scriptcut-phase-3b4-optional-fixtures-'));
  const mediaPath = path.join(fixtureRoot, 'empty.wav');
  fs.writeFileSync(mediaPath, Buffer.alloc(16));
  const port = 43000 + (process.pid % 1000);
  const child = require('child_process').spawn(packageInfo.plan.command, [
    ...packageInfo.plan.argsPrefix,
    '-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', String(port),
  ], { cwd: packageInfo.plan.backendRoot, env: workerEnvironment(packageInfo, modelRoot, token), stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (data) => { stderr += data.toString(); });
  try {
    await waitForHealth(port, child);
    const checks = await request(port, 'GET', '/system/checks', token);
    if (checks.status !== 200) fail(`/system/checks returned ${checks.status}`);
    const engines = await request(port, 'GET', '/transcription/engines', token);
    if (engines.status !== 200) fail(`/transcription/engines returned ${engines.status}`);
    const parsedEngines = JSON.parse(engines.body);
    if (parsedEngines.default_engine !== 'whisper') fail(`default engine was ${parsedEngines.default_engine}`);
    for (const engine of ['whisperx', 'parakeet']) {
      const created = await request(port, 'POST', '/jobs/transcribe', token, { file_path: mediaPath, engine, model: 'base', use_gpu: false, use_cache: false });
      if (created.status !== 200) fail(`${engine} job creation returned ${created.status}: ${created.body}`);
      const job = await waitForFailedJob(port, token, JSON.parse(created.body).job_id);
      if (/pip install/i.test(job.error || job.message || '')) fail(`${engine} exposed pip-install guidance`);
      const health = await request(port, 'GET', '/health');
      if (health.status !== 200) fail(`/health returned ${health.status} after ${engine} failure`);
      console.log(`${engine} selected: failed cleanly; worker health afterward: 200`);
    }
    const background = await request(port, 'GET', '/background/capabilities', token);
    const audio = await request(port, 'GET', '/audio/capabilities', token);
    if (background.status !== 200 || audio.status !== 200) fail('optional capability status endpoints did not remain available');
    console.log('Packaged /system/checks: 200; baseline transcription ready; optional capabilities non-blocking');
    console.log('Packaged optional-capability smoke passed.');
  } catch (error) {
    if (stderr.trim()) console.error(stderr.trim().slice(-2000));
    throw error;
  } finally {
    if (child.exitCode === null) child.kill('SIGTERM');
    fs.rmSync(modelRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
