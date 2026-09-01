#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function fail(message) {
  throw new Error(`External beta smoke failed: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  assert(fs.existsSync(absolutePath), `${relativePath} is missing`);
  return fs.readFileSync(absolutePath, 'utf8');
}

function ordered(text, labels, label) {
  let cursor = -1;
  labels.forEach((item) => {
    const index = text.indexOf(item, cursor + 1);
    assert(index > cursor, `${label} is missing or out of order: ${item}`);
    cursor = index;
  });
}

function main() {
  const beta = read('docs/EXTERNAL_BETA.md');
  const qualification = read('docs/BETA_QUALIFICATION.md');
  const fixtureScript = read('docs/fixtures/external-beta-spoken.txt');
  const fixtureGenerator = read('scripts/generate-beta-fixture.js');
  const readme = read('README.md');
  const install = read('docs/INSTALL.md');
  const firstExport = read('docs/FIRST_EXPORT.md');
  const feedback = read('.github/ISSUE_TEMPLATE/beta_feedback.yml');

  assert(/macOS on Apple Silicon only/i.test(beta), 'beta contract does not restrict the public path to Apple Silicon macOS');
  assert(/official[\s\S]*GitHub Releases feed/i.test(beta), 'beta contract does not identify the official Releases feed');
  assert(/not signed with Apple Developer ID/i.test(beta), 'beta contract does not state the Developer ID limitation');
  assert(/not\s+notarized/i.test(beta), 'beta contract does not state the notarization limitation');
  assert(/System Settings → Privacy & Security → Open Anyway/.test(beta), 'beta contract lacks the Open Anyway path');
  assert(/self-contained packaged Python\/runtime and FFmpeg\/FFprobe/i.test(beta), 'beta contract lacks the self-contained runtime boundary');
  assert(/baseline Whisper model download and verification on first transcription/i.test(beta), 'beta contract lacks first-transcription model behavior');
  assert(/raw source media kept local/i.test(beta), 'beta contract lacks the local source-media boundary');
  assert(/no AI provider required for manual transcript editing or manual clip export/i.test(beta), 'beta contract makes AI optionality unclear');
  assert(/optional external AI actions may send the required transcript or prompt\s+context/i.test(beta), 'beta contract lacks external-provider context disclosure');
  assert(/Intel Macs, Windows, Linux, or a\s+stable release/.test(beta), 'beta contract must name unsupported public environments and stable status');

  ordered(beta, [
    'Download the intended public prerelease',
    'Install ScriptCut',
    'Launch ScriptCut',
    'Import a short spoken recording',
    'Transcribe it',
    'Remove words from the transcript',
    'Preview the edited result',
    'Create one clip manually',
    'Prepare the clip',
    'Export the clip',
    'Reveal the exported file',
    'Save the project',
    'Close ScriptCut',
    'Reopen the saved project',
    'Confirm the useful transcript edits',
  ], 'golden journey');
  assert(/does not require OpenAI, Claude, Ollama, or another AI\s+provider/i.test(beta), 'golden journey is not explicitly provider-free');
  assert(/background removal, MPS, and other optional capabilities are not required/i.test(beta), 'beta contract accidentally expands the golden journey');

  ['ScriptCut release/tag', 'macOS version', 'Mac model / Apple Silicon generation', 'Install result', 'Transcription result', 'Export result', 'Save/reopen result', 'Install DMG', 'Gatekeeper', 'model download', 'transcription', 'Remove transcript words', 'preview', 'manual clip', 'Export clip', 'save/reopen', 'support report', 'Founder assistance required', 'P0', 'P1', 'First useful export success', 'Founder-assistance-free success', 'Overall golden journey'].forEach((field) => {
    assert(new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(qualification), `qualification record lacks ${field}`);
  });
  assert(/Do not collect API keys/i.test(qualification), 'qualification record lacks the API-key warning');
  assert(/P0[\s\S]*data loss[\s\S]*P1[\s\S]*golden journey cannot complete/i.test(qualification), 'qualification record lacks the P0/P1 severity definitions');
  assert(/10–20 external testers|10-20 external testers/.test(beta), 'beta exit signals are missing');
  assert(/85% complete a first useful export without founder intervention/i.test(beta), 'beta exit success signal is missing');

  assert(/external-beta-spoken\.txt/.test(fixtureGenerator), 'fixture generator does not use the checked-in original script');
  assert(/\/usr\/bin\/say/.test(fixtureGenerator) && /ffmpeg/.test(fixtureGenerator), 'fixture generator does not use macOS speech synthesis and FFmpeg normalization');
  assert(fixtureScript.trim().split(/\s+/).length >= 8, 'fixture script is too short to exercise word editing');

  [readme, install, firstExport].forEach((doc, index) => {
    const name = ['README.md', 'docs/INSTALL.md', 'docs/FIRST_EXPORT.md'][index];
    assert(/EXTERNAL_BETA\.md/.test(doc), `${name} does not link the external-beta contract`);
    assert(/Open Anyway/.test(doc), `${name} lacks Gatekeeper approval guidance`);
    assert(/AI provider is not required|AI provider.*optional/i.test(doc), `${name} lacks provider-free core guidance`);
  });
  assert(/official[\s\S]*Releases feed|Releases feed[\s\S]*official/i.test(readme), 'README lacks official release authority');
  assert(/official[\s\S]*Releases feed|Releases feed[\s\S]*official/i.test(install), 'INSTALL lacks official release authority');
  assert(/release-specific by design/i.test(firstExport), 'FIRST_EXPORT does not explain its intentional release-specific identity');

  const creatorDocs = `${readme}\n${install}\n${firstExport}\n${beta}`;
  assert(!/\bxattr\s+-d\b|\bspctl\s+--master-disable\b|\bsudo\s+spctl\b/i.test(creatorDocs), 'creator docs contain a Gatekeeper-bypass command');

  assert(/ScriptCut version|release\/tag/i.test(feedback), 'feedback form lacks release identity');
  assert(/macOS version/i.test(feedback) && /Mac model|chip/i.test(feedback), 'feedback form lacks host diagnostics');
  assert(/workflow being attempted/i.test(feedback), 'feedback form lacks workflow context');
  assert(/expected result/i.test(feedback) && /actual result/i.test(feedback), 'feedback form lacks expected/actual results');
  assert(/reproduc/i.test(feedback), 'feedback form lacks reproducibility');
  assert(/redacted ScriptCut support report/i.test(feedback), 'feedback form lacks the redacted support-report path');
  assert(/Do not paste API keys or other secrets/i.test(feedback), 'feedback form lacks the secrets warning');

  console.log('External beta contract, golden journey, fixture recipe, qualification record, feedback path, and safety checks passed.');
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
