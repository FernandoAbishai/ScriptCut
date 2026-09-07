#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');

const frontendChecks = [
  ['Home and setup entry', 'test:home-onboarding'],
  ['Transcription creator UX', 'test:transcription-ux'],
  ['Media and transcription lifecycle', 'test:transcription-lifecycle'],
  ['Editor open and project restore frame', 'test:editor-frame'],
  ['Transcript selection and manual clip entry', 'test:transcript-selection'],
  ['Create Clips workspace', 'test:create-clips-workspace'],
  ['Create Clips media/project lifecycle', 'test:clips-first-lifecycle'],
  ['Clip draft persistence and readiness', 'test:clip-drafts'],
  ['Clip prepare and export', 'test:clip-prepare-export'],
  ['Clip batch export recovery', 'test:clip-batch-export'],
  ['Clip presentation preview', 'test:clip-presentation'],
  ['Export progressive disclosure', 'test:settings-export-ux'],
  ['Creator errors and accessibility', 'test:errors-accessibility'],
  ['Edited playback synchronization', 'test:playback-sync'],
  ['Editor persistence and undo invariants', 'test:editor-state'],
];

function run(name, command, args) {
  console.log(`\n==> ${name}`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    console.error(`${name} failed: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`${name} failed with exit code ${result.status}.`);
    process.exit(result.status || 1);
  }
}

for (const [name, script] of frontendChecks) {
  run(name, 'npm', ['run', script, '--prefix', 'frontend']);
}

run('Atomic project-file persistence', 'npm', ['run', 'smoke:project-file-io']);

console.log('\nGolden creator-path source and persistence gates passed.');
