#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { CLOSURE_SCHEMA, validateQualification, verifyPublishedRelease } = require('./check-published-release');

function fail(message) {
  throw new Error(`Published release verifier smoke failed: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

async function expectFailure(callback, label) {
  try {
    await callback();
  } catch (_error) {
    return;
  }
  fail(`${label} was accepted`);
}

function digest(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function fixtureRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scriptcut-published-release-'));
  const tag = 'v0.1.0-alpha.4';
  const commit = 'a'.repeat(40);
  const dmg = `ScriptCut-${tag}-arm64.dmg`;
  const contents = {
    [dmg]: Buffer.from('DMG fixture\n'),
    'SHA256SUMS.txt': null,
    'release-manifest.json': null,
    'RELEASE_NOTES.md': Buffer.from('# ScriptCut v0.1.0-alpha.4 alpha\n\n## What\'s changed\n\n- Exact.\n'),
    [`${dmg}.sigstore.json`]: Buffer.from('{"subject":"dmg"}\n'),
    'release-manifest.sigstore.json': Buffer.from('{"subject":"manifest"}\n'),
  };
  contents['release-manifest.json'] = Buffer.from(`${JSON.stringify({
    schema: 'scriptcut.release.v2',
    version: '0.1.0',
    releaseTag: tag,
    artifact: { filename: dmg, sha256: digest(contents[dmg]), bytes: contents[dmg].length },
  }, null, 2)}\n`);
  contents['SHA256SUMS.txt'] = Buffer.from(`${digest(contents[dmg])}  ${dmg}\n`);
  for (const [name, value] of Object.entries(contents)) fs.writeFileSync(path.join(root, name), value);
  return { root, tag, commit, contents };
}

function makeApi(fixture, { annotated = false } = {}) {
  const assets = Object.entries(fixture.contents).map(([name, content]) => ({ name, digest: `sha256:${digest(content)}` }));
  const release = {
    id: 42,
    html_url: 'https://github.com/FernandoAbishai/ScriptCut/releases/tag/v0.1.0-alpha.4',
    tag_name: fixture.tag,
    draft: false,
    prerelease: true,
    name: `ScriptCut ${fixture.tag}`,
    body: fixture.contents['RELEASE_NOTES.md'].toString('utf8'),
    target_commitish: fixture.commit,
    assets,
  };
  return {
    getTagRef: () => annotated
      ? { object: { type: 'tag', sha: 'b'.repeat(40) } }
      : { object: { type: 'commit', sha: fixture.commit } },
    getAnnotatedTag: () => ({ object: { type: 'commit', sha: fixture.commit } }),
    getRelease: () => release,
  };
}

async function main() {
  const fixture = fixtureRoot();
  try {
    assert(validateQualification('NOT_REQUIRED', '').status === 'NOT_REQUIRED', 'NOT_REQUIRED qualification was rejected');
    assert(validateQualification('PASSED_PHYSICAL_MAC', 'https://github.com/FernandoAbishai/ScriptCut/issues/1').reference.startsWith('https://'), 'durable qualification reference was rejected');
    await expectFailure(() => validateQualification('PASSED_PHYSICAL_MAC', ''), 'qualification without reference');
    await expectFailure(() => validateQualification('PASSED_PHYSICAL_MAC', '/Users/private/test'), 'private path qualification reference');
    const base = { repo: 'FernandoAbishai/ScriptCut', tag: fixture.tag, commit: fixture.commit, dir: fixture.root, verifiedAt: '2026-08-13T00:00:00.000Z' };
    const lightweight = await verifyPublishedRelease({ ...base, api: makeApi(fixture) });
    assert(lightweight.schema === CLOSURE_SCHEMA, 'closure schema is incorrect');
    assert(lightweight.verification.tagCommit === fixture.commit, 'lightweight tag did not resolve');
    const annotated = await verifyPublishedRelease({ ...base, api: makeApi(fixture, { annotated: true }) });
    assert(annotated.verification.releaseNotes === true, 'annotated tag verification did not complete');

    await expectFailure(() => verifyPublishedRelease({ ...base, commit: 'c'.repeat(40), api: makeApi(fixture) }), 'wrong tag commit');
    await expectFailure(() => verifyPublishedRelease({ ...base, api: { ...makeApi(fixture), getRelease: () => { throw new Error('missing release'); } } }), 'missing release');
    await expectFailure(() => verifyPublishedRelease({ ...base, api: { ...makeApi(fixture), getRelease: () => ({ ...makeApi(fixture).getRelease(), draft: true }) } }), 'draft release');
    await expectFailure(() => verifyPublishedRelease({ ...base, api: { ...makeApi(fixture), getRelease: () => ({ ...makeApi(fixture).getRelease(), prerelease: false }) } }), 'non-prerelease release');
    await expectFailure(() => verifyPublishedRelease({ ...base, api: { ...makeApi(fixture), getRelease: () => ({ ...makeApi(fixture).getRelease(), assets: makeApi(fixture).getRelease().assets.slice(1) }) } }), 'missing asset');
    await expectFailure(() => verifyPublishedRelease({ ...base, api: { ...makeApi(fixture), getRelease: () => ({ ...makeApi(fixture).getRelease(), assets: [...makeApi(fixture).getRelease().assets, { name: 'unexpected.txt', digest: `sha256:${'0'.repeat(64)}` }] }) } }), 'extra asset');
    await expectFailure(() => verifyPublishedRelease({ ...base, api: { ...makeApi(fixture), getRelease: () => ({ ...makeApi(fixture).getRelease(), assets: makeApi(fixture).getRelease().assets.map((asset) => asset.name === fixture.tag ? asset : asset.name === 'SHA256SUMS.txt' ? { ...asset, digest: `sha256:${'0'.repeat(64)}` } : asset) }) } }), 'digest mismatch');
    await expectFailure(() => verifyPublishedRelease({ ...base, api: { ...makeApi(fixture), getRelease: () => ({ ...makeApi(fixture).getRelease(), body: 'wrong body\n' }) } }), 'notes/body mismatch');
    const output = path.join(fixture.root, 'release-closure.json');
    const closure = await verifyPublishedRelease({ ...base, api: makeApi(fixture), output, creatorQualification: 'NOT_REQUIRED' });
    assert(JSON.parse(fs.readFileSync(output, 'utf8')).artifact.sha256 === closure.artifact.sha256, 'closure output was not written');
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
  console.log('Published release verifier passed lightweight, annotated, negative, digest, notes, and exact-six-asset fixture checks.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
