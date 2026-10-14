#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  resolveBackendLaunchPlan,
  resolveResourcePath,
  validateRuntimeManifest,
} = require('../electron/runtime-contract');
const { readModelManifest } = require('./model-artifacts');

const root = path.join(__dirname, '..');
const FORBIDDEN_RUNTIME_ENTRIES = new Set([
  '.venv',
  '.venv311',
  'runtime-cache',
  'pip-cache',
  'whisperx',
  'nemo',
  'pyannote',
  'df',
  'deepfilternet',
  'mediapipe',
  'cv2',
  'openai',
  'anthropic',
  'moviepy',
]);

function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(message) {
  throw new Error(`Packaged runtime check failed: ${message}`);
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function findAppBundles(directory) {
  if (!fs.existsSync(directory)) return [];
  const bundles = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (!entry.isDirectory()) continue;
    if (entry.name.endsWith('.app')) {
      bundles.push(entryPath);
      continue;
    }
    bundles.push(...findAppBundles(entryPath));
  }
  return bundles;
}

function newestApp(arch) {
  const explicit = optionValue('--app');
  if (explicit) return path.resolve(explicit);
  const distDir = path.join(root, 'dist');
  const preferred = findAppBundles(path.join(distDir, `mac-${arch}`));
  const candidates = preferred.length > 0 ? preferred : findAppBundles(distDir);
  if (candidates.length === 0) fail('could not find an unpacked .app under dist/');
  return candidates.sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)[0];
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    env: options.env || process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...(options.maxBuffer ? { maxBuffer: options.maxBuffer } : {}),
  });
  if (result.error || result.status !== 0) {
    fail(`${command} ${args.join(' ')} failed: ${(result.error?.message || result.stderr || result.stdout || '').trim()}`);
  }
  return result;
}

function assertExecutable(filePath, label) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
  } catch {
    fail(`${label} is missing or not executable: ${path.relative(root, filePath)}`);
  }
}

function directorySize(directory) {
  if (!fs.existsSync(directory)) return 0;
  const stat = fs.statSync(directory);
  if (stat.isFile()) return stat.size;
  return fs.readdirSync(directory).reduce((total, entry) => total + directorySize(path.join(directory, entry)), 0);
}

function findForbiddenResourceEntry(directory, rootDirectory = directory) {
  if (!fs.existsSync(directory)) return null;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relativeEntry = path.relative(rootDirectory, path.join(directory, entry.name));
    const isModelCache = entry.name === 'models' && !relativeEntry.split(path.sep).includes('site-packages');
    if (FORBIDDEN_RUNTIME_ENTRIES.has(entry.name.toLowerCase()) || isModelCache) {
      return path.relative(directory, path.join(directory, entry.name));
    }
    if (entry.isDirectory()) {
      const nested = findForbiddenResourceEntry(path.join(directory, entry.name), rootDirectory);
      if (nested) return path.join(entry.name, nested);
    }
  }
  return null;
}

function findResourceFile(directory, filename) {
  if (!fs.existsSync(directory)) return null;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isFile() && entry.name === filename) return entryPath;
    if (entry.isDirectory()) {
      const found = findResourceFile(entryPath, filename);
      if (found) return found;
    }
  }
  return null;
}

function isolatedPythonEnvironment(corePackRoot) {
  const environment = {
    ...process.env,
    PYTHONNOUSERSITE: '1',
    PYTHONDONTWRITEBYTECODE: '1',
    PYTHONPATH: corePackRoot,
  };
  delete environment.PYTHONHOME;
  delete environment.VIRTUAL_ENV;
  delete environment.SCRIPTCUT_PYTHON_PATH;
  delete environment.CUTSCRIPT_PYTHON_PATH;
  environment.SCRIPTCUT_ALLOW_TOKENLESS_DEV = '1';
  return environment;
}

function inspectPackage(appPath) {
  const resourcesPath = path.join(appPath, 'Contents', 'Resources');
  const manifestPath = path.join(resourcesPath, 'manifests', 'runtime-manifest.json');
  const modelManifestPath = path.join(resourcesPath, 'manifests', 'model-manifest.json');
  if (!fs.existsSync(manifestPath)) fail('Resources/manifests/runtime-manifest.json is missing');
  if (!fs.existsSync(modelManifestPath)) fail('Resources/manifests/model-manifest.json is missing');

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    fail(`runtime manifest is not valid JSON: ${error.message}`);
  }
  const normalized = validateRuntimeManifest(manifest, { expectedTarget: 'darwin-arm64' });
  if (
    normalized.python.profile !== 'execution-only'
    || normalized.python.buildToolingBundled !== false
    || normalized.python.guiToolkitBundled !== false
  ) {
    fail('packaged Python must declare the execution-only runtime profile without build or GUI tooling');
  }
  const constraints = manifest.packs?.constraints;
  if (!constraints || typeof constraints.source !== 'string' || !/^[a-f0-9]{64}$/.test(constraints.sha256 || '')) {
    fail('runtime manifest is missing valid core dependency constraints provenance');
  }
  if (path.isAbsolute(constraints.source)) fail('runtime constraints source must be repository-relative');
  const constraintsPath = path.resolve(root, constraints.source);
  const relativeConstraintsPath = path.relative(root, constraintsPath);
  if (!relativeConstraintsPath || relativeConstraintsPath.startsWith('..') || path.isAbsolute(relativeConstraintsPath)) {
    fail('runtime constraints source escapes the repository root');
  }
  if (!fs.existsSync(constraintsPath)) fail(`runtime constraints source is missing: ${constraints.source}`);
  if (sha256(constraintsPath) !== constraints.sha256) fail('runtime constraints SHA-256 does not match the committed source');
  const dependencyLock = manifest.packs?.lock;
  if (
    !dependencyLock
    || typeof dependencyLock.source !== 'string'
    || !/^[a-f0-9]{64}$/.test(dependencyLock.sha256 || '')
    || dependencyLock.requireHashes !== true
    || dependencyLock.buildIsolation !== false
  ) {
    fail('runtime manifest is missing valid hash-locked dependency provenance');
  }
  if (path.isAbsolute(dependencyLock.source)) fail('runtime dependency lock source must be repository-relative');
  const dependencyLockPath = path.resolve(root, dependencyLock.source);
  const relativeDependencyLockPath = path.relative(root, dependencyLockPath);
  if (!relativeDependencyLockPath || relativeDependencyLockPath.startsWith('..') || path.isAbsolute(relativeDependencyLockPath)) {
    fail('runtime dependency lock source escapes the repository root');
  }
  if (!fs.existsSync(dependencyLockPath)) fail(`runtime dependency lock source is missing: ${dependencyLock.source}`);
  if (sha256(dependencyLockPath) !== dependencyLock.sha256) fail('runtime dependency lock SHA-256 does not match the committed source');
  let modelManifest;
  try {
    modelManifest = readModelManifest(modelManifestPath);
  } catch (error) {
    fail(`model manifest is invalid: ${error.message}`);
  }
  const serializedManifest = JSON.stringify(manifest);
  if (/\/Users\/|\/tmp\/|build\//.test(serializedManifest)) {
    fail('runtime manifest contains an absolute or build-local path');
  }

  const pythonPath = resolveResourcePath(resourcesPath, normalized.python.executable, 'Python executable');
  const portablePythonRoot = path.dirname(path.dirname(pythonPath));
  const backendRoot = resolveResourcePath(resourcesPath, normalized.backend.root, 'backend root');
  const corePackRoot = resolveResourcePath(resourcesPath, normalized.packs.core, 'core pack root');
  assertExecutable(pythonPath, 'Bundled Python');
  if (!fs.statSync(backendRoot).isDirectory()) fail('backend root is not a directory');
  if (!fs.statSync(corePackRoot).isDirectory()) fail('core pack root is not a directory');

  let externalResolverCalled = false;
  const plan = resolveBackendLaunchPlan({
    runtimeMode: 'packaged-bundled',
    resourcesPath,
    userDataPath: path.join(root, 'build', 'runtime-check-user-data'),
    platform: 'darwin',
    arch: 'arm64',
    resolvePython: () => {
      externalResolverCalled = true;
      throw new Error('external resolver must not be called in packaged-bundled mode');
    },
  });
  if (externalResolverCalled) fail('external Python resolver was called');
  if (plan.pythonSource !== 'bundled' || plan.command !== pythonPath) fail('launch plan did not resolve the bundled interpreter');

  const environment = isolatedPythonEnvironment(corePackRoot);
  const versionResult = run(pythonPath, ['--version'], { env: environment });
  const versionOutput = `${versionResult.stdout || ''}${versionResult.stderr || ''}`.trim();
  if (!versionOutput.includes(normalized.python.version)) {
    fail(`Python version ${versionOutput} does not match manifest ${normalized.python.version}`);
  }
  run(pythonPath, ['-c', [
    'import fastapi, uvicorn, pydantic, requests, numpy as np, torch, whisper',
    'a = np.ones((32, 32)); b = a @ a; assert float(b[0, 0]) == 32.0',
    'from numba import njit; f = njit(lambda x: x + 1); assert f(2) == 3',
    'x = torch.tensor([1.0, 2.0]); y = x * 2; assert y.tolist() == [2.0, 4.0]',
    'from importlib.metadata import version, distributions; assert version("openai-whisper") == "20250625"',
    'import main, sys; forbidden = ("whisperx", "nemo", "pyannote.audio", "df", "mediapipe", "cv2", "openai", "anthropic", "moviepy"); assert all(name not in sys.modules for name in forbidden)',
    'installed = {(d.metadata.get("Name") or "").lower() for d in distributions()}; assert not installed.intersection({"whisperx", "nemo-toolkit", "pyannote.audio", "deepfilternet", "mediapipe", "opencv-python", "openai", "anthropic", "moviepy"})',
  ].join('; ')], { cwd: backendRoot, env: environment });

  const architecture = run('file', [pythonPath]).stdout || '';
  if (!/arm64/i.test(architecture)) fail(`bundled Python architecture is not arm64: ${architecture.trim()}`);
  const forbidden = findForbiddenResourceEntry(resourcesPath);
  if (forbidden) fail(`packaged Resources contains forbidden developer/cache data: ${forbidden}`);
  for (const relativePath of [
    'llvmlite/binding/libllvmlite.dylib',
    'numpy/.dylibs/libopenblas64_.0.dylib',
    'torch/lib/libtorch_cpu.dylib',
    'torch/lib/libtorch_python.dylib',
  ]) {
    const nativePath = path.join(corePackRoot, ...relativePath.split('/'));
    if (!fs.existsSync(nativePath)) fail(`packaged native runtime target is missing: ${relativePath}`);
    run('/usr/bin/codesign', ['--verify', '--strict', nativePath]);
    const symbols = run('/usr/bin/nm', ['-m', nativePath], { maxBuffer: 16 * 1024 * 1024 }).stdout || '';
    if (/\bnon-external\b/i.test(symbols)) {
      fail(`packaged native runtime target still contains local symbols after strip -x: ${relativePath}`);
    }
  }
  for (const relativePath of [
    'include',
    'lib/python3.11/site-packages',
    'lib/python3.11/ensurepip',
    'lib/python3.11/idlelib',
    'lib/python3.11/tkinter',
    'lib/libtcl9.0.dylib',
    'lib/libtcl9tk9.0.dylib',
    'bin/pip',
  ]) {
    if (fs.existsSync(path.join(portablePythonRoot, ...relativePath.split('/')))) {
      fail(`packaged portable Python still contains build-only tooling: ${relativePath}`);
    }
  }
  const bundledModel = findResourceFile(resourcesPath, 'base.pt');
  if (bundledModel) fail(`packaged Resources contains the Whisper model weight: ${path.relative(resourcesPath, bundledModel)}`);

  const runtimePythonRoot = path.join(resourcesPath, 'runtime', 'python');
  const coreSize = directorySize(corePackRoot);
  const runtimeSize = directorySize(runtimePythonRoot);
  const backendSize = directorySize(backendRoot);
  const binSize = directorySize(path.join(resourcesPath, 'bin'));
  const appSize = directorySize(appPath);
  console.log('Size diagnostics are non-canonical; use bundle-size-report.json for logical-byte release evidence.');
  console.log(`Packaged app: mac-arm64 (${appSize} bytes)`);
  console.log(`Portable Python: ${runtimeSize} bytes`);
  console.log(`Core pack: ${coreSize} bytes`);
  console.log(`Backend: ${backendSize} bytes`);
  console.log(`FFmpeg/bin: ${binSize} bytes`);
  console.log(`Manifest: ${normalized.schema}, ${normalized.target.id}, Python ${normalized.python.version}`);
  console.log('Python profile: execution-only; build tooling: No; GUI toolkit: No');
  console.log(`Core constraints: ${constraints.source}, SHA-256 ${constraints.sha256}`);
  console.log(`Core dependency lock: ${dependencyLock.source}, SHA-256 ${dependencyLock.sha256}, requireHashes=true, buildIsolation=false`);
  console.log(`Model manifest: ${modelManifest.id}, ${modelManifest.revision}, ${modelManifest.expectedBytes} bytes`);
  console.log('Core execution probe: NumPy/OpenBLAS, Numba/llvmlite, Torch, Whisper==20250625');
  console.log('Optional packages bundled: No');
  console.log('Backend import: passed');
  console.log('Model weight in Resources: No');
  console.log('Packaged runtime check passed.');

  return { appPath, resourcesPath, manifest: normalized, pythonPath, backendRoot, corePackRoot, plan };
}

function main() {
  if (process.platform !== 'darwin') fail('this verification is only applicable to a macOS app package');
  const arch = optionValue('--arch') || process.env.SCRIPTCUT_BUILD_ARCH || process.arch;
  if (arch !== 'arm64') fail(`this phase only verifies darwin-arm64, received ${arch}`);
  return inspectPackage(newestApp(arch));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

module.exports = { findAppBundles, newestApp, inspectPackage };
