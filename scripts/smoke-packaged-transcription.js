#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { newestApp, inspectPackage } = require('./check-packaged-runtime');

const root = path.join(__dirname, '..');

function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(message) {
  throw new Error(`Packaged transcription smoke failed: ${message}`);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function request(port, method, pathname, token, payload) {
  return new Promise((resolve) => {
    const body = payload ? JSON.stringify(payload) : '';
    const headers = {
      ...(token ? { 'X-ScriptCut-Token': token } : {}),
      ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}),
    };
    const req = http.request({ hostname: '127.0.0.1', port, method, path: pathname, headers }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode || 0,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('error', () => resolve({ status: 0, body: '' }));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve({ status: 0, body: '' });
    });
    if (body) req.write(body);
    req.end();
  });
}

function parseJson(response, label) {
  try {
    return JSON.parse(response.body);
  } catch (error) {
    fail(`${label} was not JSON: ${error.message}`);
  }
}

function makeWorkerEnvironment(packageInfo, modelRoot, token, networkDisabled) {
  const environment = {
    ...process.env,
    ...packageInfo.plan.environment,
    SCRIPTCUT_API_TOKEN: token,
    SCRIPTCUT_FILE_TOKEN_SECRET: token,
    SCRIPTCUT_MODEL_ROOT: modelRoot,
    SCRIPTCUT_PYTHON_PATH: '/definitely/not/a/python',
    CUTSCRIPT_PYTHON_PATH: '/definitely/not/a/python',
    PYTHONNOUSERSITE: '1',
    PYTHONPATH: packageInfo.corePackRoot,
    PATH: '/usr/bin:/bin',
    PYTHONUNBUFFERED: '1',
  };
  delete environment.VIRTUAL_ENV;
  delete environment.PYTHONHOME;
  delete environment.SCRIPTCUT_ALLOW_TOKENLESS_DEV;
  if (networkDisabled) environment.SCRIPTCUT_MODEL_NETWORK_DISABLED = '1';
  else delete environment.SCRIPTCUT_MODEL_NETWORK_DISABLED;

  const binRoot = path.join(packageInfo.resourcesPath, 'bin', 'darwin-arm64');
  const ffmpegPath = path.join(binRoot, 'ffmpeg');
  const ffprobePath = path.join(binRoot, 'ffprobe');
  if (fs.existsSync(ffmpegPath)) {
    environment.SCRIPTCUT_FFMPEG_PATH = ffmpegPath;
    environment.IMAGEIO_FFMPEG_EXE = ffmpegPath;
    environment.FFMPEG_BINARY = ffmpegPath;
  }
  if (fs.existsSync(ffprobePath)) environment.SCRIPTCUT_FFPROBE_PATH = ffprobePath;
  environment.PATH = `${binRoot}:${environment.PATH}`;
  return environment;
}

async function startWorker(packageInfo, modelRoot, token, networkDisabled) {
  const port = 42000 + (process.pid % 1000);
  const child = spawn(packageInfo.plan.command, [
    ...packageInfo.plan.argsPrefix,
    '-m', 'uvicorn', 'main:app',
    '--host', '127.0.0.1',
    '--port', String(port),
  ], {
    cwd: packageInfo.plan.backendRoot,
    env: makeWorkerEnvironment(packageInfo, modelRoot, token, networkDisabled),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (data) => { stderr += data.toString(); });
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30000) {
    if (child.exitCode !== null) fail(`worker exited before readiness with code ${child.exitCode}: ${stderr.slice(-1000)}`);
    if ((await request(port, 'GET', '/health')).status === 200) return { child, port, stderr: () => stderr };
    await sleep(250);
  }
  child.kill('SIGKILL');
  fail(`worker did not reach /health within 30 seconds: ${stderr.slice(-1000)}`);
}

async function stopWorker(worker) {
  if (!worker || worker.child.exitCode !== null) return;
  await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    worker.child.once('exit', finish);
    worker.child.kill('SIGTERM');
    setTimeout(() => {
      if (worker.child.exitCode === null) worker.child.kill('SIGKILL');
      setTimeout(finish, 1000);
    }, 5000);
  });
}

async function runJob(worker, token, audioPath, useGpu) {
  const created = await request(worker.port, 'POST', '/jobs/transcribe', token, {
    file_path: audioPath,
    engine: 'auto',
    model: 'base',
    use_gpu: useGpu,
    use_cache: false,
  });
  if (created.status !== 200) fail(`transcription job creation returned ${created.status}: ${created.body}`);
  const jobId = parseJson(created, 'transcription job creation').job_id;
  const messages = [];
  const observations = [];
  const startedAt = Date.now();
  while (Date.now() - startedAt < 12 * 60 * 1000) {
    await sleep(700);
    const response = await request(worker.port, 'GET', `/jobs/${jobId}`, token);
    if (response.status !== 200) fail(`transcription job polling returned ${response.status}`);
    const job = parseJson(response, 'transcription job');
    observations.push({ progress: Number(job.progress) || 0, message: job.message || '' });
    for (const entry of job.logs || []) {
      if (entry.message && !messages.includes(entry.message)) messages.push(entry.message);
    }
    if (job.message && !messages.includes(job.message)) messages.push(job.message);
    if (job.status === 'succeeded') return { job, messages, observations, elapsedMs: Date.now() - startedAt };
    if (job.status === 'failed' || job.status === 'canceled') fail(`transcription job ${job.status}: ${job.error || job.message}`);
  }
  fail('transcription job did not finish within 12 minutes');
}

function createAudioFixture(packageInfo, directory) {
  const source = path.join(directory, 'spoken.aiff');
  const output = path.join(directory, 'spoken.wav');
  const spoken = spawnSync('/usr/bin/say', ['-o', source, 'ScriptCut local transcription test'], { encoding: 'utf8' });
  if (spoken.status !== 0) fail(`could not generate repository-safe speech fixture: ${spoken.stderr || spoken.stdout}`);
  const ffmpeg = path.join(packageInfo.resourcesPath, 'bin', 'darwin-arm64', 'ffmpeg');
  const converted = spawnSync(ffmpeg, ['-y', '-i', source, '-ar', '16000', '-ac', '1', output], { encoding: 'utf8' });
  if (converted.status !== 0) fail(`could not convert speech fixture: ${converted.stderr || converted.stdout}`);
  return output;
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

async function realModelSmoke(packageInfo) {
  const token = 'scriptcut-packaged-transcription-token';
  const modelRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scriptcut-phase-3b3-models-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scriptcut-phase-3b3-audio-'));
  const modelManifest = JSON.parse(fs.readFileSync(path.join(packageInfo.resourcesPath, 'manifests', 'model-manifest.json'), 'utf8'));
  const modelPath = path.join(modelRoot, 'whisper', 'base', modelManifest.revision, modelManifest.filename);
  const audioPath = createAudioFixture(packageInfo, fixtureRoot);
  let worker;
  try {
    worker = await startWorker(packageInfo, modelRoot, token, false);
    const before = parseJson(await request(worker.port, 'GET', '/transcription/models', token), 'initial model status').models[0];
    if (before.installed || before.verified) fail('model root was not empty at first use');
    const first = await runJob(worker, token, audioPath, process.argv.includes('--use-gpu'));
    const after = parseJson(await request(worker.port, 'GET', '/transcription/models', token), 'installed model status').models[0];
    if (!after.installed || !after.verified || !after.active) fail('first-use model was not verified and activated');
    if (!fs.existsSync(modelPath)) fail('managed model weight was not installed in the app-managed root');
    const downloadedBytes = fs.statSync(modelPath).size;
    const downloadedHash = sha256(modelPath);
    if (downloadedBytes !== modelManifest.expectedBytes || downloadedHash !== modelManifest.sha256) fail('downloaded model metadata does not match the trusted manifest');
    const result = first.job.result || {};
    if (result.engine !== 'whisper' || result.model !== 'base' || !result.words?.length || !result.segments?.length) fail('first transcription result did not meet the normalized contract');
    for (const word of result.words) {
      if (!word.word || !Number.isFinite(word.start) || !Number.isFinite(word.end) || word.start < 0 || word.end < word.start) fail('first transcription returned invalid word timing');
    }
    for (const stage of ['Downloading transcription model', 'Verifying transcription model', 'Loading transcription model', 'Transcribing locally']) {
      if (!first.messages.includes(stage)) fail(`first-use progress did not expose stage: ${stage}`);
    }
    await stopWorker(worker);

    worker = await startWorker(packageInfo, modelRoot, token, true);
    const offline = await runJob(worker, token, audioPath, process.argv.includes('--use-gpu'));
    if (offline.job.status !== 'succeeded') fail('offline second-use transcription did not succeed');
    await stopWorker(worker);

    fs.writeFileSync(modelPath, Buffer.from('corrupt-model'));
    worker = await startWorker(packageInfo, modelRoot, token, false);
    const corruptStatus = parseJson(await request(worker.port, 'GET', '/transcription/models', token), 'corrupt model status').models[0];
    if (corruptStatus.verified) fail('corrupt model was still reported verified');
    const repaired = await runJob(worker, token, audioPath, process.argv.includes('--use-gpu'));
    if (repaired.job.status !== 'succeeded') fail('corrupt model repair transcription did not succeed');

    const deleted = await request(worker.port, 'DELETE', '/transcription/models/whisper-base', token);
    if (deleted.status !== 200) fail(`model deletion returned ${deleted.status}: ${deleted.body}`);
    const deletedStatus = parseJson(await request(worker.port, 'GET', '/transcription/models', token), 'deleted model status').models[0];
    if (deletedStatus.installed || deletedStatus.verified) fail('deleted model remained installed');
    const reacquired = await runJob(worker, token, audioPath, process.argv.includes('--use-gpu'));
    if (reacquired.job.status !== 'succeeded') fail('transcription after deletion did not reacquire the model');

    console.log(`First-use model download: ${downloadedBytes} bytes, SHA-256 ${downloadedHash}`);
    console.log(`First-use model location: app-managed writable model storage (${first.elapsedMs} ms)`);
    console.log(`First-use transcription: ${result.words.length} words, ${result.segments.length} segments, language=${result.language || 'unknown'}, engine=${result.engine}, model=${result.model}`);
    const downloadProgress = first.observations.filter((sample) => sample.message === 'Downloading transcription model');
    console.log(`Observed model-download progress: ${downloadProgress.length} values (first=${downloadProgress[0]?.progress ?? 'n/a'}, last=${downloadProgress.at(-1)?.progress ?? 'n/a'})`);
    console.log(`Offline second-use transcription: succeeded (${offline.elapsedMs} ms) with network disabled`);
    console.log('Corrupt-model repair: rejected unverified candidate and repaired successfully');
    console.log('Deletion and reacquisition: model removed, cache evicted, and next transcription succeeded');
    console.log(`Device request: ${process.argv.includes('--use-gpu') ? 'current automatic device selection' : 'CPU'}`);
    console.log('Packaged transcription smoke passed.');
  } finally {
    await stopWorker(worker);
    fs.rmSync(modelRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

async function main() {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') fail(`requires native macOS arm64, received ${process.platform}-${process.arch}`);
  const packageInfo = inspectPackage(newestApp(optionValue('--arch') || 'arm64'));
  if (!process.argv.includes('--real-model')) {
    console.log('Packaged transcription smoke package checks passed; real model gate skipped (use --real-model).');
    return;
  }
  await realModelSmoke(packageInfo);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
