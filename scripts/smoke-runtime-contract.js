#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  RUNTIME_SCHEMA,
  createRuntimeContract,
  getTarget,
  resolveBackendLaunchPlan,
  resolveResourcePath,
  selectRuntimeMode,
  validateRuntimeManifest,
} = require('../electron/runtime-contract');

const fakeResolver = () => ({ command: '/tmp/python3.11', argsPrefix: ['-E'] });
const resourcesPath = path.join('/tmp', 'ScriptCut.app', 'Contents', 'Resources');
const userDataPath = path.join('/tmp', 'user', 'ScriptCut');
const projectRoot = path.join('/tmp', 'scriptcut-runtime-contract-project');

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

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scriptcut-runtime-contract-'));
try {
  const fixtureResources = path.join(tempRoot, 'Resources');
  const fixtureManifestPath = path.join(fixtureResources, 'manifests', 'runtime-manifest.json');
  const fixturePythonPath = path.join(fixtureResources, 'runtime', 'python', 'darwin-arm64', '3.11.15+20260807', 'bin', 'python3.11');
  const fixtureBackendRoot = path.join(fixtureResources, 'backend');
  const fixtureCoreRoot = path.join(fixtureResources, 'runtime', 'packs', 'core', 'darwin-arm64');
  fs.mkdirSync(path.dirname(fixturePythonPath), { recursive: true });
  fs.mkdirSync(fixtureBackendRoot, { recursive: true });
  fs.mkdirSync(fixtureCoreRoot, { recursive: true });
  fs.writeFileSync(fixturePythonPath, '# fixture executable\n');
  fs.chmodSync(fixturePythonPath, 0o755);

  const fixtureManifest = {
    schema: RUNTIME_SCHEMA,
    target: { platform: 'darwin', arch: 'arm64' },
    python: { version: '3.11.15', executable: 'runtime/python/darwin-arm64/3.11.15+20260807/bin/python3.11' },
    backend: { root: 'backend' },
    packs: { core: 'runtime/packs/core/darwin-arm64' },
    security: { tokenRequired: true },
  };
  fs.mkdirSync(path.dirname(fixtureManifestPath), { recursive: true });
  fs.writeFileSync(fixtureManifestPath, `${JSON.stringify(fixtureManifest)}\n`);

  assert.strictEqual(selectRuntimeMode({ isDev: true, packaged: false, resourcesPath: fixtureResources }), 'development');
  assert.strictEqual(selectRuntimeMode({ packaged: true, resourcesPath: path.join(tempRoot, 'legacy-resources') }), 'packaged-legacy');
  assert.strictEqual(selectRuntimeMode({ packaged: true, resourcesPath: fixtureResources }), 'packaged-bundled');
  assert.strictEqual(resolveResourcePath(fixtureResources, fixtureManifest.python.executable), fixturePythonPath);
  assert.throws(() => resolveResourcePath(fixtureResources, '../outside'), /traversal|escapes/);

  let externalResolverCalled = false;
  const bundledPlan = resolveBackendLaunchPlan({
    runtimeMode: 'packaged-bundled',
    resourcesPath: fixtureResources,
    userDataPath,
    platform: 'darwin',
    arch: 'arm64',
    resolvePython: () => {
      externalResolverCalled = true;
      throw new Error('external resolver must not be called');
    },
  });
  assert.strictEqual(externalResolverCalled, false);
  assert.strictEqual(bundledPlan.command, fixturePythonPath);
  assert.strictEqual(bundledPlan.pythonSource, 'bundled');
  assert.strictEqual(bundledPlan.corePackRoot, fixtureCoreRoot);
  assert.deepStrictEqual(bundledPlan.environmentKeysToRemove.sort(), [
    'CUTSCRIPT_PYTHON_PATH',
    'PYTHONHOME',
    'SCRIPTCUT_PYTHON_PATH',
    'VIRTUAL_ENV',
  ]);

  assert.throws(
    () => resolveBackendLaunchPlan({ runtimeMode: 'packaged-bundled', resourcesPath: path.join(tempRoot, 'missing-manifest'), platform: 'darwin', arch: 'arm64' }),
    /manifest is missing/,
  );

  const validManifest = fixtureManifest;
  const normalized = validateRuntimeManifest(validManifest, { expectedTarget: 'darwin-arm64' });
  assert.strictEqual(normalized.valid, true);
  assert.strictEqual(normalized.target.id, 'darwin-arm64');
  assert.throws(() => validateRuntimeManifest({ ...validManifest, schema: 'scriptcut.project.v1' }), /schema/);
  assert.throws(() => validateRuntimeManifest(validManifest, { expectedTarget: 'darwin-x64' }), /does not match expected/);
  for (const executable of ['/tmp/python', '../python', 'runtime/../../python', 'C:\\python.exe', '\\\\server\\python', '']) {
    assert.throws(
      () => validateRuntimeManifest({ ...validManifest, python: { ...validManifest.python, executable } }),
      /relative|traversal/,
    );
  }
  assert.throws(() => validateRuntimeManifest({ ...validManifest, python: { version: '3.11.15' } }), /executable/);
  assert.throws(() => validateRuntimeManifest({ ...validManifest, backend: {} }), /backend root/);
  assert.throws(() => validateRuntimeManifest({ ...validManifest, packs: {} }), /core pack/);
  assert.throws(() => validateRuntimeManifest({ ...validManifest, security: { tokenRequired: false } }), /token/);
  assert.throws(() => validateRuntimeManifest({ ...validManifest, target: { platform: 'linux', arch: 'arm64' } }), /Unsupported ScriptCut runtime target/);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('Runtime contract smoke checks passed.');
