#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const root = path.join(__dirname, '..');

function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(message) {
  throw new Error(`Packaged creator qualification smoke failed: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function appExecutable(appPath) {
  const macOsPath = path.join(appPath, 'Contents', 'MacOS');
  assert(fs.existsSync(macOsPath), `missing ${macOsPath}`);
  const executables = fs.readdirSync(macOsPath)
    .map((name) => path.join(macOsPath, name))
    .filter((filePath) => fs.statSync(filePath).isFile());
  assert(executables.length === 1, `expected one packaged executable, found ${executables.length}`);
  return executables[0];
}

function bundledTool(appPath, name) {
  const toolPath = path.join(appPath, 'Contents', 'Resources', 'bin', 'darwin-arm64', name);
  try {
    fs.accessSync(toolPath, fs.constants.X_OK);
  } catch {
    fail(`packaged ${name} is missing or not executable: ${toolPath}`);
  }
  return toolPath;
}

function runTool(command, args, label) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) {
    fail(`${label} failed: ${(result.error?.message || result.stderr || result.stdout || '').trim()}`);
  }
  return result;
}

function createMediaFixture(appPath, directory) {
  const fixturePath = path.join(directory, 'creator-qualification-source.mp4');
  runTool(bundledTool(appPath, 'ffmpeg'), [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=24',
    '-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=48000',
    '-t', '2.2',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '96k',
    '-movflags', '+faststart',
    fixturePath,
  ], 'generated media fixture');
  assert(fs.statSync(fixturePath).size > 0, 'generated media fixture is empty');
  return fixturePath;
}

function verifyPlayableOutput(appPath, outputPath) {
  assert(fs.existsSync(outputPath), 'renderer-authenticated export did not create the requested output');
  const size = fs.statSync(outputPath).size;
  assert(size > 0, 'renderer-authenticated export output is empty');

  const ffprobe = runTool(bundledTool(appPath, 'ffprobe'), [
    '-v', 'error',
    '-show_entries', 'format=duration,size',
    '-of', 'json',
    outputPath,
  ], 'packaged ffprobe output verification');
  let metadata;
  try {
    metadata = JSON.parse(ffprobe.stdout || '{}');
  } catch (error) {
    fail(`packaged ffprobe returned invalid JSON: ${error.message}`);
  }
  const duration = Number(metadata.format?.duration || 0);
  assert(Number.isFinite(duration) && duration > 0, `exported output has invalid duration ${metadata.format?.duration}`);

  runTool(bundledTool(appPath, 'ffmpeg'), [
    '-hide_banner', '-loglevel', 'error',
    '-i', outputPath,
    '-f', 'null', '-',
  ], 'packaged FFmpeg decode verification');
  return { size, duration };
}

function launchQualificationSmoke(appPath, fixturePath, outputPath, projectPath) {
  return new Promise((resolve, reject) => {
    const environment = {
      ...process.env,
      SCRIPTCUT_CREATOR_QUALIFICATION_SMOKE: '1',
      SCRIPTCUT_CREATOR_QUALIFICATION_MEDIA_PATH: fixturePath,
      SCRIPTCUT_CREATOR_QUALIFICATION_OUTPUT_PATH: outputPath,
      SCRIPTCUT_CREATOR_QUALIFICATION_PROJECT_PATH: projectPath,
    };
    delete environment.ELECTRON_RUN_AS_NODE;
    delete environment.OPENAI_API_KEY;
    delete environment.ANTHROPIC_API_KEY;

    const child = spawn(appExecutable(appPath), [], {
      cwd: root,
      env: environment,
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
      const line = output.split(/\r?\n/).find((entry) => entry.startsWith('SCRIPTCUT_CREATOR_QUALIFICATION_SMOKE_RESULT='));
      if (!line) return;
      try {
        finish(null, JSON.parse(line.slice('SCRIPTCUT_CREATOR_QUALIFICATION_SMOKE_RESULT='.length)));
      } catch (error) {
        finish(new Error(`invalid creator qualification result: ${error.message}`));
      }
    };

    child.stdout.on('data', consume);
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    child.on('error', (error) => finish(error));
    child.on('exit', (code, signal) => {
      if (settled) return;
      finish(new Error(`packaged app exited before creator qualification result (code=${code}, signal=${signal})\n${output.slice(-5000)}`));
    });
    timeoutId = setTimeout(() => {
      if (settled) return;
      finish(new Error(`creator qualification smoke timed out\n${output.slice(-5000)}`));
    }, 60000);
  });
}

async function main() {
  assert(process.platform === 'darwin' && process.arch === 'arm64', `requires native macOS arm64, received ${process.platform}-${process.arch}`);
  const appPath = path.resolve(optionValue('--app') || '');
  assert(appPath.endsWith('.app') && fs.existsSync(appPath), `packaged app is missing: ${appPath}`);

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'scriptcut-creator-qualification-'));
  const outputPath = path.join(directory, 'creator-qualified-export.mp4');
  const projectPath = path.join(directory, 'creator-roundtrip.scriptcut');
  try {
    const fixturePath = createMediaFixture(appPath, directory);
    const result = await launchQualificationSmoke(appPath, fixturePath, outputPath, projectPath);

    assert(result?.checks?.status === 200, `renderer system checks returned ${result?.checks?.status || 0}`);
    assert(result?.project?.roundTrip === true && result.project.bytes > 0, 'preload project write/read round-trip was not confirmed');
    assert(result?.source?.status === 200 && result.source.bodyBytes > 0, 'project-approved source media was not readable');
    assert(result?.export?.jobStatus === 'succeeded', `renderer export job status was ${result?.export?.jobStatus || 'missing'}`);
    assert(result?.export?.deniedCapabilityStatus === 403, 'invalid export file capability was not rejected');
    assert(result?.export?.bodyBytes > 0, 'renderer fetched an empty export output');
    assert(result?.playback?.loaded === true && result.playback.duration > 0, 'renderer did not load playable export metadata');
    assert(Array.isArray(result?.policyViolations) && result.policyViolations.length === 0, 'renderer reported a CSP violation');
    assert(fs.existsSync(projectPath) && fs.statSync(projectPath).size > 0, 'project round-trip file was not written to disk');

    const playable = verifyPlayableOutput(appPath, outputPath);
    console.log(`Generated fixture: ${fs.statSync(fixturePath).size} bytes (packaged FFmpeg)`);
    console.log(`Preload project write/read round-trip: ${result.project.bytes} bytes`);
    console.log(`Renderer-authenticated export: ${playable.size} bytes, ${playable.duration.toFixed(2)}s`);
    console.log(`Export file capability rejection/acceptance: 403 / 200`);
    console.log(`Renderer metadata playback: ${result.playback.width}x${result.playback.height}, ${result.playback.duration.toFixed(2)}s`);
    console.log('AI provider calls: none');
    console.log('Packaged creator qualification smoke passed.');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
