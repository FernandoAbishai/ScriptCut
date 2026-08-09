#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const workflowPath = path.join(root, '.github', 'workflows', 'release-unsigned.yml');

function fail(message) {
  throw new Error(`Release workflow check failed: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function jobBlock(text, name) {
  const marker = `\n  ${name}:`;
  const start = text.indexOf(marker);
  if (start < 0) fail(`job is missing: ${name}`);
  const after = start + marker.length;
  const next = text.slice(after).search(/\n  [A-Za-z0-9_-]+:/);
  return text.slice(after, next < 0 ? text.length : after + next);
}

function stepBlock(text, stepName) {
  const marker = `\n      - name: ${stepName}`;
  const start = text.indexOf(marker);
  if (start < 0) fail(`step is missing: ${stepName}`);
  const after = start + marker.length;
  const next = text.slice(after).search(/\n      - name:/);
  return text.slice(after, next < 0 ? text.length : after + next);
}

function validateWorkflowText(text) {
  const jobsStart = text.indexOf('\njobs:');
  assert(jobsStart > 0, 'jobs section is missing');
  const trigger = text.slice(0, jobsStart);
  assert(/\non:\s*\n\s+workflow_dispatch:\s*\n/.test(trigger), 'workflow_dispatch-only trigger is missing');
  assert(!/^\s{2}(?:push|pull_request|schedule):/m.test(trigger), 'automatic trigger found');
  ['release_tag', 'publish', 'real_model', 'confirmation'].forEach((input) => assert(new RegExp(`^\\s{6}${input}:`, 'm').test(trigger), `workflow input is missing: ${input}`));
  assert(/actions\/attest@v4/g.test(text) && (text.match(/actions\/attest@v4/g) || []).length === 2, 'workflow must attest exactly the DMG and manifest');

  const build = jobBlock(text, 'build');
  const clean = jobBlock(text, 'clean-runner-verify');
  const publish = jobBlock(text, 'publish');
  assert(/runs-on:\s+macos-14/.test(build), 'build runner must be macos-14');
  assert(/contents:\s+read/.test(build), 'build contents permission must be read');
  assert(/id-token:\s+write/.test(build), 'build id-token permission must be write');
  assert(/attestations:\s+write/.test(build), 'build attestations permission must be write');
  assert(/artifact-metadata:\s+write/.test(build), 'build artifact-metadata permission must be write for actions/attest@v4');
  assert(!/contents:\s+write/.test(build), 'build must not have contents write');
  assert(/actions\/attest@v4/.test(build), 'build attestation action is missing');
  assert(/actions\/upload-artifact@v4/.test(build), 'build workflow artifact upload is missing');
  assert(/-arm64-dry-run/.test(build), 'dry-run artifact naming is missing');
  assert(/-arm64-public/.test(build), 'public artifact naming is missing');

  assert(/runs-on:\s+macos-14/.test(clean), 'clean verification runner must be macos-14');
  assert(/actions\/download-artifact@v4/.test(clean), 'clean runner must download the build artifact');
  assert(/gh attestation verify/.test(clean), 'clean runner attestation verification is missing');
  assert(/--signer-repo/.test(clean) && /--signer-workflow/.test(clean) && /--source-digest/.test(clean), 'clean runner does not constrain attestation identity enough');
  assert((clean.match(/--bundle/g) || []).length >= 2, 'clean runner must verify both downloaded local attestation bundles');
  assert(/DMG_BASENAME/.test(clean) && /release-manifest\.sigstore\.json/.test(clean), 'local DMG and manifest bundle paths are not both verified');
  assert(/hdiutil verify/.test(clean) || /hdiutil attach/.test(clean), 'clean runner DMG verification is missing');
  assert(/spctl --assess/.test(clean), 'clean runner Gatekeeper diagnostic is missing');
  assert(!/spctl --master-disable|xattr\s+-dr|sudo\s+spctl/.test(clean), 'Gatekeeper bypass command found');
  assert(!/id-token:\s+write|attestations:\s+write/.test(clean), 'clean runner has build-only attestation permissions');

  assert(/if:\s+\$\{\{ inputs\.publish == true \}\}/.test(publish), 'publish job is not gated on publish=true');
  assert(/contents:\s+write/.test(publish), 'publish contents permission is missing');
  assert(!/id-token:\s+write|attestations:\s+write|artifact-metadata:\s+write/.test(publish), 'publish job has unnecessary attestation permissions');
  assert(/PUBLISH_UNSIGNED_ALPHA/.test(publish), 'publication confirmation gate is missing');
  assert(/real_model/.test(publish), 'publication real-model gate is missing');
  assert(/refs\/heads\/main/.test(publish) && /origin\/main/.test(publish) && /GITHUB_SHA/.test(publish), 'publication main-current gate is missing');
  assert(/--prerelease/.test(publish) && /--latest=false/.test(publish), 'publication prerelease/latest semantics are missing');
  assert(/actions\/download-artifact@v4/.test(publish), 'publish job must download verified output');
  assert(!/release:rc:arm64|electron-builder/.test(publish), 'publish job must not rebuild the artifact');
  const createRelease = stepBlock(publish, 'Create exact GitHub prerelease without rebuilding');
  assert(/git fetch origin main --force[\s\S]*test "\$\(git rev-parse origin\/main\)" = "\$GITHUB_SHA"[\s\S]*gh release create/.test(createRelease), 'release mutation step lacks an immediate main-current recheck');

  assert(!/(APPLE_[A-Z_]+|CSC_[A-Z_]+|Developer ID|notarytool|private key|PUBLISH_UNSIGNED_ALPHA.*secret)/i.test(text), 'Apple credential or private-signing dependency found');
  return true;
}

function main() {
  assert(fs.existsSync(workflowPath), '.github/workflows/release-unsigned.yml is missing');
  validateWorkflowText(fs.readFileSync(workflowPath, 'utf8'));
  console.log('Unsigned public release workflow structure and permission checks passed.');
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

module.exports = { validateWorkflowText };
