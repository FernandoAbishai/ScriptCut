#!/usr/bin/env node

const assert = require('assert');
const {
  PYTHON_RUNTIME_ARTIFACT,
  RUNTIME_RELATIVE_ROOT,
  CORE_PACK_RELATIVE_ROOT,
} = require('./runtime-artifacts');

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
