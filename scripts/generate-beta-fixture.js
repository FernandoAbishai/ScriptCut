#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const scriptPath = path.join(root, 'docs', 'fixtures', 'external-beta-spoken.txt');
const outputDir = path.join(root, 'dist', 'fixtures');
const outputPath = path.join(outputDir, 'external-beta-spoken.wav');

function fail(message) {
  throw new Error(`Beta fixture generation failed: ${message}`);
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) fail(`${command} is unavailable (${result.error.message})`);
  if (result.status !== 0) fail(`${command} exited with status ${result.status}`);
}

if (process.platform !== 'darwin') {
  fail('the beta fixture generator requires macOS speech synthesis');
}

if (!fs.existsSync(scriptPath)) fail(`missing source script: ${scriptPath}`);
fs.mkdirSync(outputDir, { recursive: true });
const temporaryAudio = path.join(os.tmpdir(), `scriptcut-beta-fixture-${process.pid}.aiff`);

try {
  const sentence = fs.readFileSync(scriptPath, 'utf8').trim();
  if (!sentence) fail('fixture script is empty');
  run('/usr/bin/say', ['-v', 'Samantha', '-o', temporaryAudio, sentence]);
  if (fs.statSync(temporaryAudio).size < 10_000) fail('speech synthesis produced an empty or unusable audio file');
  run('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    temporaryAudio,
    '-ac',
    '1',
    '-ar',
    '16000',
    '-c:a',
    'pcm_s16le',
    outputPath,
  ]);
  console.log(`Generated ${path.relative(root, outputPath)}`);
} finally {
  fs.rmSync(temporaryAudio, { force: true });
}
