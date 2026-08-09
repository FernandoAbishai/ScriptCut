const path = require('path');
const os = require('os');
const { resolvePythonRuntime } = require('./python-runtime');

const RUNTIME_SCHEMA = 'scriptcut.runtime.v1';
const RUNTIME_MODES = Object.freeze([
  'development',
  'packaged-legacy',
  'packaged-bundled',
]);

const SUPPORTED_TARGETS = Object.freeze({
  darwin: Object.freeze(['arm64', 'x64']),
  win32: Object.freeze(['x64']),
  linux: Object.freeze(['x64']),
});

function getTarget(platform = process.platform, arch = process.arch) {
  if (!SUPPORTED_TARGETS[platform] || !SUPPORTED_TARGETS[platform].includes(arch)) {
    throw new Error(`Unsupported ScriptCut runtime target: ${platform}-${arch}`);
  }
  return `${platform}-${arch}`;
}

function targetIdentity(target) {
  const targetValue = typeof target === 'string' ? target : `${target?.platform || ''}-${target?.arch || ''}`;
  const separator = targetValue.indexOf('-');
  if (separator <= 0 || separator === targetValue.length - 1) {
    throw new Error(`Invalid runtime target: ${targetValue || 'empty'}`);
  }
  const platform = targetValue.slice(0, separator);
  const arch = targetValue.slice(separator + 1);
  getTarget(platform, arch);
  return { platform, arch, id: `${platform}-${arch}` };
}

function normalizeAbsoluteRoot(value, fallback) {
  return path.resolve(value || fallback);
}

function createRuntimeContract(options = {}) {
  const runtimeMode = options.runtimeMode || 'development';
  if (!RUNTIME_MODES.includes(runtimeMode)) {
    throw new Error(`Unknown ScriptCut runtime mode: ${runtimeMode}`);
  }

  const platform = options.platform || process.platform;
  const arch = options.arch || process.arch;
  const target = getTarget(platform, arch);
  const projectRoot = normalizeAbsoluteRoot(options.projectRoot, path.join(__dirname, '..'));
  const resourcesPath = normalizeAbsoluteRoot(
    options.resourcesPath,
    process.resourcesPath || projectRoot,
  );
  const userDataPath = normalizeAbsoluteRoot(
    options.userDataPath,
    path.join(os.tmpdir(), 'scriptcut-user-data'),
  );
  const backendRoot = normalizeAbsoluteRoot(
    options.backendRoot,
    runtimeMode === 'development'
      ? path.join(projectRoot, 'backend')
      : path.join(resourcesPath, 'backend'),
  );
  const runtimeRoot = path.join(resourcesPath, 'runtime');
  const writableRoots = {
    modelRoot: path.join(userDataPath, 'models'),
    cacheRoot: path.join(userDataPath, 'cache'),
    logRoot: path.join(userDataPath, 'logs'),
  };
  const pythonSource = runtimeMode === 'packaged-bundled' ? 'bundled' : 'external';

  return {
    schema: RUNTIME_SCHEMA,
    runtimeMode,
    target,
    targetPlatform: platform,
    targetArch: arch,
    pythonSource,
    workerPythonSource: pythonSource,
    tokenRequired: true,
    backendRoot,
    runtimeRoot,
    embeddedCodePackRoot: path.join(runtimeRoot, 'packs'),
    runtimeManifestPath: path.join(resourcesPath, 'manifests', 'runtime-manifest.json'),
    futureRuntimeManifestPath: path.join(resourcesPath, 'manifests', 'runtime-manifest.json'),
    bundledBinRoot: path.join(resourcesPath, 'bin'),
    modelRoot: writableRoots.modelRoot,
    cacheRoot: writableRoots.cacheRoot,
    logRoot: writableRoots.logRoot,
    writableRoots,
  };
}

function assertManifestRelativePath(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty relative path`);
  }

  const normalized = value.trim().replace(/\\/g, '/');
  if (
    normalized.startsWith('/')
    || normalized.startsWith('//')
    || /^[A-Za-z]:\//.test(normalized)
  ) {
    throw new Error(`${label} must be relative`);
  }

  const segments = normalized.split('/');
  if (segments.includes('..')) {
    throw new Error(`${label} must not contain path traversal`);
  }

  return path.posix.normalize(normalized);
}

function expectedTargetIdentity(expectedTarget) {
  if (!expectedTarget) return null;
  if (typeof expectedTarget === 'string') return targetIdentity(expectedTarget);
  if (expectedTarget.target) return targetIdentity(expectedTarget.target);
  return targetIdentity(expectedTarget);
}

function validateRuntimeManifest(manifest, options = {}) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Runtime manifest must be an object');
  }
  if (manifest.schema !== RUNTIME_SCHEMA) {
    throw new Error(`Runtime manifest schema must be ${RUNTIME_SCHEMA}`);
  }

  const manifestTarget = manifest.target;
  if (!manifestTarget || typeof manifestTarget !== 'object') {
    throw new Error('Runtime manifest target is required');
  }
  const target = targetIdentity(manifestTarget);
  const expected = expectedTargetIdentity(options.expectedTarget || options.target);
  if (expected && target.id !== expected.id) {
    throw new Error(`Runtime manifest target ${target.id} does not match expected ${expected.id}`);
  }

  if (!manifest.python || typeof manifest.python !== 'object') {
    throw new Error('Runtime manifest python section is required');
  }
  if (typeof manifest.python.version !== 'string' || manifest.python.version.trim() === '') {
    throw new Error('Runtime manifest Python version is required');
  }

  const executable = assertManifestRelativePath(manifest.python.executable, 'Runtime manifest Python executable');
  const backendRoot = assertManifestRelativePath(manifest.backend?.root, 'Runtime manifest backend root');
  const corePack = assertManifestRelativePath(manifest.packs?.core, 'Runtime manifest core pack');

  if (manifest.security?.tokenRequired !== true) {
    throw new Error('Packaged runtime manifest must require the local API token');
  }

  return {
    valid: true,
    schema: manifest.schema,
    target,
    python: { ...manifest.python, executable },
    backend: { ...manifest.backend, root: backendRoot },
    packs: { ...manifest.packs, core: corePack },
    security: { ...manifest.security, tokenRequired: true },
  };
}

function resolveBackendLaunchPlan(options = {}) {
  const runtimeMode = options.runtimeMode || 'development';
  const contract = options.contract || createRuntimeContract({ ...options, runtimeMode });

  if (runtimeMode === 'packaged-bundled') {
    throw new Error('packaged-bundled runtime is not available in Phase 3B.1');
  }

  const resolver = options.resolvePython || resolvePythonRuntime;
  const python = resolver();
  if (!python || typeof python.command !== 'string' || !Array.isArray(python.argsPrefix)) {
    throw new Error('Python runtime resolver returned an invalid launch command');
  }

  return {
    ...contract,
    command: python.command,
    argsPrefix: [...python.argsPrefix],
    environment: {
      SCRIPTCUT_RUNTIME_MODE: contract.runtimeMode,
      SCRIPTCUT_RUNTIME_TARGET: contract.target,
      SCRIPTCUT_RUNTIME_PYTHON_SOURCE: contract.pythonSource,
      SCRIPTCUT_RUNTIME_MANIFEST_SCHEMA: contract.schema,
      SCRIPTCUT_MODEL_ROOT: contract.modelRoot,
      SCRIPTCUT_CACHE_ROOT: contract.cacheRoot,
      SCRIPTCUT_LOG_ROOT: contract.logRoot,
    },
  };
}

module.exports = {
  RUNTIME_SCHEMA,
  RUNTIME_MODES,
  SUPPORTED_TARGETS,
  getTarget,
  targetIdentity,
  createRuntimeContract,
  validateRuntimeManifest,
  resolveBackendLaunchPlan,
};
