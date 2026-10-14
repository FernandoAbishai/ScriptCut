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
const coreConstraints = fs.readFileSync(path.join(__dirname, '..', 'runtime', 'core-darwin-arm64-py311.constraints.txt'), 'utf8');
const coreLock = fs.readFileSync(path.join(__dirname, '..', 'runtime', 'core-darwin-arm64-py311.lock.txt'), 'utf8');
assert.ok(!coreRequirements.includes('model-manifest'));
assert.ok(!coreRequirements.includes('base.pt'));
const constraintPins = coreConstraints.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
const lockLines = coreLock.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
assert.strictEqual(lockLines.length, constraintPins.length);
for (const line of lockLines) assert.match(line, /^[a-z0-9.-]+==[^\s]+ --hash=sha256:[a-f0-9]{64}$/);
for (const requirement of coreRequirements.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'))) {
  assert.ok(coreConstraints.split(/\r?\n/).includes(requirement), `core constraints are missing direct pin: ${requirement}`);
}
for (const constraint of constraintPins) {
  const normalized = constraint.toLowerCase().replace(/_/g, '-');
  assert.ok(lockLines.some((line) => line.startsWith(`${normalized} --hash=sha256:`)), `core lock is missing artifact hash for: ${constraint}`);
}
const runtimePreparation = fs.readFileSync(path.join(__dirname, 'prepare-python-runtime.js'), 'utf8');
assert.match(runtimePreparation, /function\s+pruneNonRuntimeCoreArtifacts\s*\(/);
assert.match(runtimePreparation, /function\s+prunePythonBytecode\s*\(/);
assert.match(runtimePreparation, /function\s+prunePackageTestArtifacts\s*\(/);
assert.match(runtimePreparation, /function\s+prunePortableRuntimeBuildTooling\s*\(/);
assert.match(runtimePreparation, /profile:\s*['"]execution-only['"]/);
assert.match(runtimePreparation, /buildToolingBundled:\s*false/);
assert.match(runtimePreparation, /guiToolkitBundled:\s*false/);
assert.match(runtimePreparation, /RUNTIME_REQUIRED_TEST_DIRECTORIES\s*=\s*new Set\(\[['"]torch\/testing['"]\]\)/);
for (const expectedBuildOnlyPath of [
  'lib/python3.11/site-packages',
  'lib/python3.11/ensurepip',
  'lib/python3.11/tkinter',
  'lib/python3.11/lib-dynload/_tkinter.cpython-311-darwin.so',
  'lib/libtcl9.0.dylib',
  'lib/libtcl9tk9.0.dylib',
]) {
  assert.ok(runtimePreparation.includes(`'${expectedBuildOnlyPath}'`), `portable runtime prune is missing ${expectedBuildOnlyPath}`);
}
assert.match(runtimePreparation, /['"]--no-compile['"]/);
assert.match(runtimePreparation, /['"]--no-build-isolation['"]/);
assert.match(runtimePreparation, /['"]--require-hashes['"]/);
assert.match(runtimePreparation, /['"]--requirement['"],\s*coreLockPath/);
assert.match(runtimePreparation, /PYTHONDONTWRITEBYTECODE\s*=\s*['"]1['"]/);
assert.match(runtimePreparation, /path\.join\(\s*corePackRoot\s*,\s*['"]torch['"]\s*,\s*['"]include['"]\s*\)/);
assert.match(runtimePreparation, /fs\.rmSync\(\s*torchIncludePath\s*,\s*\{[\s\S]*?recursive:\s*true/);
assert.ok(!/path\.join\(\s*corePackRoot\s*,\s*['"]torch['"]\s*\)/.test(runtimePreparation));
assert.ok(!/path\.join\(\s*corePackRoot\s*,\s*['"]torch['"]\s*,\s*['"]lib['"]\s*\)/.test(runtimePreparation));
assert.ok(!/rmSync\([^)]*include\s+directories|rmSync\([^)]*glob/i.test(runtimePreparation));

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
