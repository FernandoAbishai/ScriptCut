#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const packageJson = require('../package.json');
const {
  PYTHON_RUNTIME_ARTIFACT,
  RUNTIME_RELATIVE_ROOT,
  CORE_PACK_RELATIVE_ROOT,
} = require('./runtime-artifacts');

const commonModelMappings = (packageJson.build?.extraResources || []).filter((entry) => (
  entry.from === 'runtime/models/whisper-base.json'
  && entry.to === 'manifests/model-manifest.json'
));
assert.strictEqual(commonModelMappings.length, 1);
assert.ok(!(packageJson.build?.extraResources || []).some((entry) => entry.from === 'build/manifests'));
const coreRequirements = fs.readFileSync(path.join(__dirname, '..', 'runtime', 'core-darwin-arm64-py311.txt'), 'utf8');
assert.ok(!coreRequirements.includes('model-manifest'));
assert.ok(!coreRequirements.includes('base.pt'));

assert.strictEqual(PYTHON_RUNTIME_ARTIFACT.provider, 'python-build-standalone');
assert.strictEqual(PYTHON_RUNTIME_ARTIFACT.pythonVersion, '3.11.15');
assert.strictEqual(PYTHON_RUNTIME_ARTIFACT.build, '20260807');
assert.strictEqual(PYTHON_RUNTIME_ARTIFACT.target, 'darwin-arm64');
assert.match(PYTHON_RUNTIME_ARTIFACT.source, /^https:\/\/github\.com\/astral-sh\/python-build-standalone\/releases\/download\//);
assert.match(PYTHON_RUNTIME_ARTIFACT.sha256, /^[a-f0-9]{64}$/);
assert.ok(!/latest/i.test(PYTHON_RUNTIME_ARTIFACT.source));
assert.ok(RUNTIME_RELATIVE_ROOT.endsWith('3.11.15+20260807'));
assert.strictEqual(CORE_PACK_RELATIVE_ROOT, 'runtime/packs/core/darwin-arm64');

console.log('Pinned runtime artifact metadata smoke checks passed.');
