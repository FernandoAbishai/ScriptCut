#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { preparePublicRelease, validateReleaseTag } = require('./prepare-public-release');
const { validateManifest, validateNotes } = require('./check-public-release');
const { validateWorkflowText } = require('./check-release-workflow');

const root = path.join(__dirname, '..');

function fail(message) {
  throw new Error(`Public release smoke failed: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function expectFailure(callback, label) {
  try {
    callback();
  } catch (_error) {
    return;
  }
  fail(`${label} was accepted`);
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function writeFixture(rootDir) {
  const candidateDir = path.join(rootDir, 'candidate');
  const outputDir = path.join(rootDir, 'public');
  fs.mkdirSync(candidateDir, { recursive: true });
  const content = Buffer.from('ScriptCut public release fixture\n');
  const filename = 'ScriptCut-0.1.0-arm64.dmg';
  fs.writeFileSync(path.join(candidateDir, filename), content);
  fs.writeFileSync(path.join(candidateDir, 'release-manifest.json'), `${JSON.stringify({
    schema: 'scriptcut.release.v1',
    version: '0.1.0',
    signed: false,
    notarized: false,
    artifact: { filename, bytes: content.length, sha256: sha256(content) },
    runtime: {
      mode: 'packaged-bundled',
      pythonSource: 'bundled',
      target: { platform: 'darwin', arch: 'arm64' },
      schema: 'scriptcut.runtime.v1',
      pythonVersion: '3.11.15',
      pythonBuild: '20260807',
      manifestSha256: '1'.repeat(64),
    },
    coreInventorySha256: '2'.repeat(64),
    ffmpeg: { platform: 'darwin', architecture: 'arm64', manifestSha256: '3'.repeat(64) },
    model: { id: 'whisper-base', revision: '4'.repeat(64), expectedBytes: 10, sha256: '4'.repeat(64), manifestSha256: '5'.repeat(64), embedded: false },
  }, null, 2)}\n`, 'utf8');
  return { candidateDir, outputDir };
}

async function main() {
  const invalidTags = ['v0.1.0', '0.1.0-alpha.3', 'v0.2.0-alpha.1', 'v0.1.0-beta.1', 'v0.1.0-alpha.0', 'v0.1.0-alpha.-1'];
  invalidTags.forEach((tag) => expectFailure(() => validateReleaseTag(tag, '0.1.0', ['v0.1.0-alpha.1', 'v0.1.0-alpha.2']), tag));
  expectFailure(() => validateReleaseTag('v0.1.0-alpha.2', '0.1.0', ['v0.1.0-alpha.1', 'v0.1.0-alpha.2']), 'existing tag');
  expectFailure(() => validateReleaseTag('v0.1.0-alpha.1', '0.1.0', ['v0.1.0-alpha.1', 'v0.1.0-alpha.2']), 'older alpha');
  expectFailure(() => validateReleaseTag('v0.1.0-alpha.2', '0.1.0', ['v0.1.0-alpha.1', 'v0.1.0-alpha.2']), 'equal alpha');
  assert(validateReleaseTag('v0.1.0-alpha.3', '0.1.0', ['v0.1.0-alpha.1', 'v0.1.0-alpha.2']).suffix === 3, 'valid next alpha was rejected');

  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scriptcut-public-release-'));
  try {
    const fixture = writeFixture(fixtureRoot);
    const result = await preparePublicRelease({
      tag: 'v0.1.0-alpha.3',
      existingTags: ['v0.1.0-alpha.1', 'v0.1.0-alpha.2'],
      candidateDir: fixture.candidateDir,
      outputDir: fixture.outputDir,
      commit: 'a'.repeat(40),
      dmgAttestationUrl: 'https://github.com/FernandoAbishai/ScriptCut/attestations/123',
      dmgAttestationId: '123',
    });
    const manifest = JSON.parse(fs.readFileSync(result.manifestPath, 'utf8'));
    const notes = fs.readFileSync(path.join(fixture.outputDir, 'RELEASE_NOTES.md'), 'utf8');
    validateManifest(manifest);
    validateNotes(notes);
    assert(manifest.artifact.filename === 'ScriptCut-v0.1.0-alpha.3-arm64.dmg', 'public DMG naming convention is wrong');
    assert(fs.existsSync(path.join(fixture.outputDir, manifest.artifact.filename)), 'public DMG was not staged');
    assert(fs.readFileSync(path.join(fixture.outputDir, 'SHA256SUMS.txt'), 'utf8').includes(manifest.artifact.filename), 'public checksum filename is wrong');
    const publicDmgPath = path.join(fixture.outputDir, manifest.artifact.filename);
    const beforePreserveHash = sha256(fs.readFileSync(publicDmgPath));
    await preparePublicRelease({
      tag: 'v0.1.0-alpha.3',
      existingTags: ['v0.1.0-alpha.1', 'v0.1.0-alpha.2'],
      candidateDir: fixture.candidateDir,
      outputDir: fixture.outputDir,
      preserveOutput: true,
      commit: 'a'.repeat(40),
      dmgAttestationUrl: 'https://github.com/FernandoAbishai/ScriptCut/attestations/123',
      dmgAttestationId: '123',
    });
    assert(sha256(fs.readFileSync(publicDmgPath)) === beforePreserveHash, 'preserve-output changed the attested DMG bytes');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }

  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  const readmeCreator = readme.slice(0, readme.indexOf('## Contributor quick start'));
  assert(!/releases\/latest/.test(readmeCreator), 'README creator path still links releases/latest');
  assert(/github\.com\/FernandoAbishai\/ScriptCut\/releases/.test(readmeCreator), 'README creator path does not link the release feed');
  assert(!/local Python 3\.10|backend dependency set/i.test(readmeCreator), 'README packaged Python claim is stale');
  assert(/supported self-contained public-alpha path|explicitly identified/i.test(readmeCreator), 'README lacks temporal self-contained path truth');
  assert(/Older alpha releases may predate/i.test(readmeCreator), 'README lacks historical alpha clarification');
  assert(!/(?:current|downloadable) (?:public )?alpha/i.test(readmeCreator), 'README claims an unpublished alpha is current or downloadable');

  const install = fs.readFileSync(path.join(root, 'docs', 'INSTALL.md'), 'utf8');
  const installCreator = install.slice(0, install.indexOf('## Source Development Requirements'));
  assert(!/releases\/latest|install Python|local Python|python\.org/i.test(installCreator), 'creator INSTALL section has stale setup guidance');
  assert(/Privacy & Security|Open Anyway|official ScriptCut Releases/i.test(installCreator), 'creator INSTALL section lacks unsigned first-launch path');
  assert(/qualifying self-contained release|Older alpha releases may predate/i.test(installCreator), 'INSTALL lacks temporal self-contained path truth');
  assert(!/(?:current|downloadable) (?:public )?alpha/i.test(installCreator), 'INSTALL claims an unpublished alpha is current or downloadable');

  const firstExport = fs.readFileSync(path.join(root, 'docs', 'FIRST_EXPORT.md'), 'utf8');
  assert(!/install Python|local Python|pip install|install FFmpeg/i.test(firstExport), 'FIRST_EXPORT contains packaged creator setup instructions');
  assert(/first transcription|downloads and verifies|Open Anyway/i.test(firstExport), 'FIRST_EXPORT lacks public baseline/first-launch truth');
  assert(/self-contained.*release notes|Older alpha releases may predate/i.test(firstExport), 'FIRST_EXPORT lacks temporal self-contained path truth');
  assert(!/(?:current|downloadable) (?:public )?alpha/i.test(firstExport), 'FIRST_EXPORT claims an unpublished alpha is current or downloadable');

  const userGuide = fs.readFileSync(path.join(root, 'docs', 'USER_GUIDE.md'), 'utf8');
  const userGuideCreator = userGuide.slice(0, userGuide.indexOf('## Browser Mode'));
  assert(!/releases\/latest|local Python|install Python|install FFmpeg/i.test(userGuideCreator), 'USER_GUIDE contains stale packaged creator setup guidance');
  assert(/Releases feed|Privacy & Security|supported self-contained public-alpha path/i.test(userGuideCreator), 'USER_GUIDE lacks temporal packaged path truth');
  assert(!/(?:current|downloadable) (?:public )?alpha/i.test(userGuideCreator), 'USER_GUIDE claims an unpublished alpha is current or downloadable');

  const platform = fs.readFileSync(path.join(root, 'docs', 'PLATFORM_SUPPORT.md'), 'utf8');
  assert(/self-contained public-alpha|portable Python.*bundled|unsigned|first-launch/i.test(platform), 'PLATFORM_SUPPORT lacks public arm64 truth');
  assert(/Older alpha releases may predate|when identified by release notes/i.test(platform), 'PLATFORM_SUPPORT lacks temporal alpha clarification');
  assert(/local Python 3\.10-3\.12/.test(platform.split('## Maintainer Release Check')[1] || ''), 'PLATFORM_SUPPORT contributor/maintainer truth was removed');

  const verifyRelease = fs.readFileSync(path.join(root, 'docs', 'VERIFY_RELEASE.md'), 'utf8');
  assert(/shasum -a 256 -c SHA256SUMS\.txt/.test(verifyRelease), 'VERIFY_RELEASE lacks checksum command');
  assert(/gh attestation verify/.test(verifyRelease) && /does not prove.*vulnerabil/i.test(verifyRelease), 'VERIFY_RELEASE lacks bounded attestation guidance');

  validateWorkflowText(fs.readFileSync(path.join(root, '.github', 'workflows', 'release-unsigned.yml'), 'utf8'));
  console.log('Public release metadata, tag, notes, documentation, and workflow static tests passed.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
