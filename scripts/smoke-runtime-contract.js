#!/usr/bin/env node

const assert = require('assert');
const path = require('path');
const {
  RUNTIME_SCHEMA,
  createRuntimeContract,
  getTarget,
  resolveBackendLaunchPlan,
  validateRuntimeManifest,
} = require('../electron/runtime-contract');

const resourcesPath = path.join('/tmp', 'scriptcut-runtime', 'Resources');
const userDataPath = path.join('/tmp', 'scriptcut-runtime', 'UserData');
const projectRoot = path.join('/tmp', 'scriptcut-runtime', 'project');
const fakeResolver = () => ({ command: '/tmp/python3.11', argsPrefix: ['-E'] });

assert.strictEqual(getTarget('darwin', 'arm64'), 'darwin-arm64');
assert.strictEqual(getTarget('darwin', 'x64'), 'darwin-x64');
assert.strictEqual(getTarget('win32', 'x64'), 'win32-x64');
assert.strictEqual(getTarget('linux', 'x64'), 'linux-x64');
assert.throws(() => getTarget('linux', 'arm64'), /Unsupported ScriptCut runtime target/);

const contract = createRuntimeContract({
  runtimeMode: 'packaged-legacy',
  resourcesPath,
  userDataPath,
  projectRoot,
  platform: 'darwin',
  arch: 'arm64',
});
assert.strictEqual(contract.schema, RUNTIME_SCHEMA);
assert.strictEqual(contract.target, 'darwin-arm64');
assert.strictEqual(contract.pythonSource, 'external');
assert.strictEqual(contract.backendRoot, path.join(resourcesPath, 'backend'));
assert.strictEqual(contract.runtimeRoot, path.join(resourcesPath, 'runtime'));
assert.strictEqual(contract.embeddedCodePackRoot, path.join(resourcesPath, 'runtime', 'packs'));
assert.strictEqual(contract.runtimeManifestPath, path.join(resourcesPath, 'manifests', 'runtime-manifest.json'));
assert.strictEqual(contract.bundledBinRoot, path.join(resourcesPath, 'bin'));
assert.strictEqual(contract.modelRoot, path.join(userDataPath, 'models'));
assert.strictEqual(contract.cacheRoot, path.join(userDataPath, 'cache'));
assert.strictEqual(contract.logRoot, path.join(userDataPath, 'logs'));

for (const runtimeMode of ['development', 'packaged-legacy']) {
  const plan = resolveBackendLaunchPlan({
    runtimeMode,
    resourcesPath,
    userDataPath,
    projectRoot,
    platform: 'darwin',
    arch: 'arm64',
    resolvePython: fakeResolver,
  });
  assert.strictEqual(plan.command, '/tmp/python3.11');
  assert.deepStrictEqual(plan.argsPrefix, ['-E']);
  assert.strictEqual(plan.environment.SCRIPTCUT_RUNTIME_MODE, runtimeMode);
  assert.strictEqual(plan.environment.SCRIPTCUT_RUNTIME_TARGET, 'darwin-arm64');
  assert.strictEqual(plan.environment.SCRIPTCUT_RUNTIME_PYTHON_SOURCE, 'external');
  assert.strictEqual(plan.environment.SCRIPTCUT_RUNTIME_MANIFEST_SCHEMA, RUNTIME_SCHEMA);
}
assert.throws(
  () => resolveBackendLaunchPlan({ runtimeMode: 'packaged-bundled', resourcesPath, userDataPath, projectRoot }),
  /not available in Phase 3B\.1/,
);

const validManifest = {
  schema: RUNTIME_SCHEMA,
  target: { platform: 'darwin', arch: 'arm64' },
  python: { version: '3.11.15', executable: 'runtime/python/bin/python3.11' },
  backend: { root: 'backend' },
  packs: { core: 'runtime/packs/core' },
  security: { tokenRequired: true },
};
const normalized = validateRuntimeManifest(validManifest, { expectedTarget: 'darwin-arm64' });
assert.strictEqual(normalized.valid, true);
assert.strictEqual(normalized.target.id, 'darwin-arm64');

assert.throws(
  () => validateRuntimeManifest({ ...validManifest, schema: 'scriptcut.project.v1' }),
  /schema/,
);
assert.throws(
  () => validateRuntimeManifest(validManifest, { expectedTarget: 'darwin-x64' }),
  /does not match expected/,
);
for (const executable of ['/tmp/python', '../python', 'runtime/../../python', 'C:\\python.exe', '\\\\server\\python', '']) {
  assert.throws(
    () => validateRuntimeManifest({ ...validManifest, python: { ...validManifest.python, executable } }),
    /relative|traversal/,
  );
}
assert.throws(
  () => validateRuntimeManifest({ ...validManifest, python: { version: '3.11.15' } }),
  /executable/,
);
assert.throws(
  () => validateRuntimeManifest({ ...validManifest, backend: {} }),
  /backend root/,
);
assert.throws(
  () => validateRuntimeManifest({ ...validManifest, packs: {} }),
  /core pack/,
);
assert.throws(
  () => validateRuntimeManifest({ ...validManifest, security: { tokenRequired: false } }),
  /token/,
);
assert.throws(
  () => validateRuntimeManifest({ ...validManifest, target: { platform: 'linux', arch: 'arm64' } }),
  /Unsupported ScriptCut runtime target/,
);

console.log('Runtime contract smoke checks passed.');
