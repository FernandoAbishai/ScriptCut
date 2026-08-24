#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { selectReleaseNotes, parseChangelog } = require('./release-notes');
const { preparePublicRelease } = require('./prepare-public-release');

const root = path.join(__dirname, '..');

function fail(message) {
  throw new Error(`Release notes smoke failed: ${message}`);
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

async function expectFailureAsync(callback, label) {
  try {
    await callback();
  } catch (_error) {
    return;
  }
  fail(`${label} was accepted`);
}

function writeChangelog(directory, content) {
  const filePath = path.join(directory, 'CHANGELOG.md');
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

function writeCandidate(directory) {
  const candidateDir = path.join(directory, 'candidate');
  fs.mkdirSync(candidateDir, { recursive: true });
  const content = Buffer.from('release notes fixture dmg\n');
  const filename = 'ScriptCut-0.1.0-arm64.dmg';
  fs.writeFileSync(path.join(candidateDir, filename), content);
  const crypto = require('crypto');
  const sha256 = crypto.createHash('sha256').update(content).digest('hex');
  fs.writeFileSync(path.join(candidateDir, 'release-manifest.json'), `${JSON.stringify({
    schema: 'scriptcut.release.v1',
    version: '0.1.0',
    signed: false,
    notarized: false,
    artifact: { filename, bytes: content.length, sha256 },
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
    codeSignature: { type: 'ad-hoc', structurallyValid: true, hardenedRuntime: false },
    ffmpeg: { platform: 'darwin', architecture: 'arm64', manifestSha256: '3'.repeat(64) },
    model: { id: 'whisper-base', revision: '4'.repeat(64), expectedBytes: 10, sha256: '4'.repeat(64), manifestSha256: '5'.repeat(64), embedded: false },
  }, null, 2)}\n`, 'utf8');
  return candidateDir;
}

async function main() {
  const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  const sections = parseChangelog(changelog);
  assert(sections.has('Unreleased'), 'repository changelog lacks Unreleased');
  assert(sections.has('v0.1.0-alpha.3'), 'repository changelog lacks alpha.3 history');
  assert(sections.has('v0.1.0-alpha.4'), 'repository changelog lacks alpha.4 release notes');
  const repositoryDryRun = selectReleaseNotes({ releaseTag: 'v0.1.0-alpha.4' });
  assert(repositoryDryRun.source === 'v0.1.0-alpha.4', 'repository dry-run did not select exact alpha.4 notes');
  assert(repositoryDryRun.markdown.trim().length > 0, 'repository alpha.4 notes are empty');
  const repositoryPublication = selectReleaseNotes({ releaseTag: 'v0.1.0-alpha.4', publicationNotesRequired: true });
  assert(repositoryPublication.source === 'v0.1.0-alpha.4', 'repository publication did not select exact alpha.4 notes');
  assert(selectReleaseNotes({ releaseTag: 'v0.1.0-alpha.3' }).source === 'v0.1.0-alpha.3', 'exact release section did not win');

  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scriptcut-release-notes-'));
  try {
    const fixture = writeChangelog(fixtureRoot, '# Changelog\n\n## Unreleased\n\n### Added\n\n- Planned.\n\n## v0.1.0-alpha.4\n\n- Exact.\n');
    assert(selectReleaseNotes({ releaseTag: 'v0.1.0-alpha.4', changelogPath: fixture }).markdown.includes('Exact.'), 'exact fixture section was not selected');
    expectFailure(() => selectReleaseNotes({ releaseTag: 'v0.1.0-alpha.5', publicationNotesRequired: true, changelogPath: fixture }), 'publication missing section');

    const duplicate = writeChangelog(fixtureRoot, '# Changelog\n\n## Unreleased\n\n- One.\n\n## v0.1.0-alpha.4\n\n- First.\n\n## v0.1.0-alpha.4\n\n- Second.\n');
    expectFailure(() => selectReleaseNotes({ releaseTag: 'v0.1.0-alpha.4', changelogPath: duplicate }), 'duplicate release section');
    const malformed = writeChangelog(fixtureRoot, '# Changelog\n\n## Unreleased\n\n- One.\n\n## v0.1.0-alpha.x\n\n- Bad.\n');
    expectFailure(() => selectReleaseNotes({ releaseTag: 'v0.1.0-alpha.4', changelogPath: malformed }), 'malformed release heading');
    const empty = writeChangelog(fixtureRoot, '# Changelog\n\n## Unreleased\n\n- One.\n\n## v0.1.0-alpha.4\n\n');
    expectFailure(() => selectReleaseNotes({ releaseTag: 'v0.1.0-alpha.4', publicationNotesRequired: true, changelogPath: empty }), 'empty exact release section');

    const headingOnlyExact = writeChangelog(fixtureRoot, '# Changelog\n\n## Unreleased\n\n- Planned.\n\n## v0.1.0-alpha.4\n\n### Added\n');
    expectFailure(() => selectReleaseNotes({ releaseTag: 'v0.1.0-alpha.4', publicationNotesRequired: true, changelogPath: headingOnlyExact }), 'heading-only exact publication section');

    const headingOnlyUnreleased = writeChangelog(fixtureRoot, '# Changelog\n\n## Unreleased\n\n### Fixed\n');
    expectFailure(() => selectReleaseNotes({ releaseTag: 'v0.1.0-alpha.5', changelogPath: headingOnlyUnreleased }), 'heading-only Unreleased section');

    const headingAndBullet = writeChangelog(fixtureRoot, '# Changelog\n\n## Unreleased\n\n### Fixed\n\n- A real fix.\n');
    assert(selectReleaseNotes({ releaseTag: 'v0.1.0-alpha.5', changelogPath: headingAndBullet }).markdown.includes('- A real fix.'), 'subsection heading plus bullet was rejected');

    const plannedFixture = writeChangelog(fixtureRoot, '# Changelog\n\n## Unreleased\n\n### Added\n\n- Planned.\n\n');
    const candidateDir = writeCandidate(fixtureRoot);
    const outputDir = path.join(fixtureRoot, 'public');
    const result = await preparePublicRelease({
      tag: 'v0.1.0-alpha.4',
      existingTags: ['v0.1.0-alpha.1', 'v0.1.0-alpha.2', 'v0.1.0-alpha.3'],
      candidateDir,
      outputDir,
      commit: 'a'.repeat(40),
      changelogPath: plannedFixture,
    });
    const notes = fs.readFileSync(path.join(result.outputDir, 'RELEASE_NOTES.md'), 'utf8');
    assert(notes.includes("## What's changed"), 'generated notes lack curated section');
    assert(notes.includes('Dry-run / planned release-note content'), 'Unreleased dry-run content is not labeled');
    assert(notes.includes('Planned.'), 'generated notes omit Unreleased content');
    await expectFailureAsync(() => preparePublicRelease({
      tag: 'v0.1.0-alpha.5',
      existingTags: ['v0.1.0-alpha.1', 'v0.1.0-alpha.2', 'v0.1.0-alpha.3'],
      candidateDir,
      outputDir: path.join(fixtureRoot, 'publication'),
      commit: 'a'.repeat(40),
      changelogPath: plannedFixture,
      publicationNotesRequired: true,
    }), 'publication without exact release notes');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
  console.log('Release changelog parser, selection, dry-run, publication, and generated-note checks passed.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
