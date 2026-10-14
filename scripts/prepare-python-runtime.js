#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  PYTHON_RUNTIME_ARTIFACT,
  RUNTIME_ARCHIVE_RELATIVE_PATH,
  RUNTIME_RELATIVE_ROOT,
  CORE_PACK_RELATIVE_ROOT,
} = require('./runtime-artifacts');
const { readModelManifest } = require('./model-artifacts');

const root = path.join(__dirname, '..');
const target = process.env.SCRIPTCUT_RUNTIME_TARGET || getOption('--target') || PYTHON_RUNTIME_ARTIFACT.target;
const buildRoot = path.join(root, 'build');
const runtimeCacheRoot = path.join(buildRoot, 'runtime-cache');
const archivePath = path.join(buildRoot, RUNTIME_ARCHIVE_RELATIVE_PATH);
const runtimeRoot = path.join(buildRoot, RUNTIME_RELATIVE_ROOT);
const corePackRoot = path.join(buildRoot, CORE_PACK_RELATIVE_ROOT);
const manifestPath = path.join(buildRoot, 'manifests', 'runtime-manifest.json');
const modelInputPath = path.join(root, 'runtime', 'models', 'whisper-base.json');
const generatedModelManifestPath = path.join(buildRoot, 'manifests', 'model-manifest.json');
const coreInputPath = path.join(root, 'runtime', 'core-darwin-arm64-py311.txt');
const coreConstraintsPath = path.join(root, 'runtime', 'core-darwin-arm64-py311.constraints.txt');
const coreLockPath = path.join(root, 'runtime', 'core-darwin-arm64-py311.lock.txt');
// Torch imports torch.testing through its normal autograd import path.
const RUNTIME_REQUIRED_TEST_DIRECTORIES = new Set(['torch/testing']);
const PORTABLE_RUNTIME_BUILD_ONLY_PATHS = [
  'include',
  'lib/pkgconfig',
  'lib/python3.11/site-packages',
  'lib/python3.11/ensurepip',
  'lib/python3.11/idlelib',
  'lib/python3.11/pydoc_data',
  'lib/python3.11/tkinter',
  'lib/python3.11/turtledemo',
  'lib/python3.11/lib2to3',
  'lib/python3.11/venv',
  'lib/python3.11/lib-dynload/_tkinter.cpython-311-darwin.so',
  'lib/tcl9.0',
  'lib/tcl9',
  'lib/tk9.0',
  'lib/itcl4.3.8',
  'lib/thread3.0.6',
  'lib/libtcl9.0.dylib',
  'lib/libtcl9tk9.0.dylib',
  'bin/2to3',
  'bin/2to3-3.11',
  'bin/idle3',
  'bin/idle3.11',
  'bin/pip',
  'bin/pip3',
  'bin/pip3.11',
  'bin/pydoc3',
  'bin/pydoc3.11',
  'bin/python3-config',
  'bin/python3.11-config',
];
const NATIVE_RUNTIME_STRIP_TARGETS = [
  'llvmlite/binding/libllvmlite.dylib',
  'numpy/.dylibs/libopenblas64_.0.dylib',
  'torch/lib/libtorch_cpu.dylib',
  'torch/lib/libtorch_python.dylib',
];

function getOption(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(message) {
  throw new Error(`Portable Python preparation failed: ${message}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    env: options.env || process.env,
    encoding: 'utf8',
    stdio: options.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) fail(`${command} could not run: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = `${result.stderr || ''}${result.stdout || ''}`.trim().slice(-1800);
    fail(`${command} ${args.join(' ')} exited with ${result.status}: ${detail}`);
  }
  return result;
}

function verifyTarget() {
  if (target !== PYTHON_RUNTIME_ARTIFACT.target) {
    fail(`only ${PYTHON_RUNTIME_ARTIFACT.target} is supported by this phase, received ${target}`);
  }
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    fail(`run this preparation on a native macOS arm64 host, received ${process.platform}-${process.arch}`);
  }
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function downloadFile(url, destination, redirects = 0) {
  if (redirects > 5) return Promise.reject(new Error('too many download redirects'));
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        downloadFile(response.headers.location, destination, redirects + 1).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`download returned HTTP ${response.statusCode}`));
        return;
      }

      const output = fs.createWriteStream(destination, { flags: 'wx' });
      response.pipe(output);
      output.on('finish', () => output.close(resolve));
      output.on('error', (error) => {
        response.destroy();
        fs.rmSync(destination, { force: true });
        reject(error);
      });
    });
    request.on('error', reject);
  });
}

async function ensureVerifiedArchive() {
  fs.mkdirSync(runtimeCacheRoot, { recursive: true });
  if (fs.existsSync(archivePath)) {
    const cachedHash = sha256(archivePath);
    if (cachedHash === PYTHON_RUNTIME_ARTIFACT.sha256) {
      console.log(`Using verified cached Python archive: ${path.relative(root, archivePath)}`);
      return;
    }
    console.warn('Cached Python archive checksum mismatch; reacquiring the pinned artifact.');
    fs.rmSync(archivePath, { force: true });
  }

  const temporaryPath = `${archivePath}.partial-${process.pid}`;
  fs.rmSync(temporaryPath, { force: true });
  console.log(`Downloading ${PYTHON_RUNTIME_ARTIFACT.archive} from the official release...`);
  await downloadFile(PYTHON_RUNTIME_ARTIFACT.source, temporaryPath);
  const downloadedHash = sha256(temporaryPath);
  if (downloadedHash !== PYTHON_RUNTIME_ARTIFACT.sha256) {
    fs.rmSync(temporaryPath, { force: true });
    fail(`checksum mismatch: expected ${PYTHON_RUNTIME_ARTIFACT.sha256}, received ${downloadedHash}`);
  }
  fs.renameSync(temporaryPath, archivePath);
  console.log(`Verified Python archive SHA-256: ${downloadedHash}`);
}

function findFile(directory, names) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isFile() && names.has(entry.name)) return entryPath;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'node_modules') continue;
    const found = findFile(path.join(directory, entry.name), names);
    if (found) return found;
  }
  return null;
}

function normalizeRuntimeSymlinks(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      const rawTarget = fs.readlinkSync(entryPath);
      const localTarget = path.join(path.dirname(entryPath), path.basename(rawTarget));
      if (!fs.existsSync(localTarget)) {
        fail(`portable runtime symlink target is missing: ${path.relative(root, entryPath)} -> ${rawTarget}`);
      }
      fs.unlinkSync(entryPath);
      fs.symlinkSync(path.basename(rawTarget), entryPath);
      continue;
    }
    if (entry.isDirectory()) normalizeRuntimeSymlinks(entryPath);
  }
}

function extractPython() {
  fs.rmSync(runtimeRoot, { recursive: true, force: true });
  fs.mkdirSync(runtimeRoot, { recursive: true });
  const extractionRoot = fs.mkdtempSync(path.join(runtimeCacheRoot, 'python-extract-'));
  try {
    run('tar', ['-xzf', archivePath, '-C', extractionRoot]);
    const extractedInterpreter = findFile(extractionRoot, new Set(['python3.11', 'python3']));
    if (!extractedInterpreter) fail('the archive did not contain a Python 3.11 executable');
    const extractedDistributionRoot = path.dirname(path.dirname(extractedInterpreter));
    // The standalone archive contains absolute symlinks into its extraction root.
    // Normalize them so the staged runtime remains relocatable inside Resources.
    fs.cpSync(extractedDistributionRoot, runtimeRoot, { recursive: true, dereference: false });
    normalizeRuntimeSymlinks(runtimeRoot);
  } finally {
    fs.rmSync(extractionRoot, { recursive: true, force: true });
  }

  const relativeInterpreter = path.relative(runtimeRoot, findFile(runtimeRoot, new Set(['python3.11', 'python3'])) || '');
  if (!relativeInterpreter || relativeInterpreter.startsWith('..')) {
    fail('could not normalize the extracted interpreter into the runtime staging root');
  }
  const interpreterPath = path.join(runtimeRoot, relativeInterpreter);
  fs.chmodSync(interpreterPath, 0o755);
  try {
    fs.accessSync(interpreterPath, fs.constants.X_OK);
  } catch {
    fail(`bundled interpreter is not executable: ${path.relative(root, interpreterPath)}`);
  }
  return { interpreterPath, relativeInterpreter: relativeInterpreter.split(path.sep).join('/') };
}

function isolatedEnvironment(extra = {}) {
  const environment = { ...process.env, ...extra };
  delete environment.PYTHONHOME;
  delete environment.VIRTUAL_ENV;
  delete environment.SCRIPTCUT_PYTHON_PATH;
  delete environment.CUTSCRIPT_PYTHON_PATH;
  environment.PYTHONNOUSERSITE = '1';
  environment.PYTHONDONTWRITEBYTECODE = '1';
  return environment;
}

function verifyArchitecture(interpreterPath) {
  const result = run('file', [interpreterPath]);
  if (!/arm64/i.test(result.stdout || '')) {
    fail(`bundled interpreter is not arm64-compatible: ${result.stdout.trim()}`);
  }
}

function pythonVersion(interpreterPath, environment) {
  const result = run(interpreterPath, ['--version'], { env: environment });
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
  const match = output.match(/Python\s+(\d+\.\d+\.\d+)/i);
  if (!match || match[1] !== PYTHON_RUNTIME_ARTIFACT.pythonVersion) {
    fail(`bundled interpreter reported ${output}, expected Python ${PYTHON_RUNTIME_ARTIFACT.pythonVersion}`);
  }
  return match[1];
}

function installCorePack(interpreterPath) {
  if (!fs.existsSync(coreInputPath)) fail(`missing committed core input: ${path.relative(root, coreInputPath)}`);
  if (!fs.existsSync(coreConstraintsPath)) fail(`missing committed core constraints: ${path.relative(root, coreConstraintsPath)}`);
  if (!fs.existsSync(coreLockPath)) fail(`missing committed core artifact lock: ${path.relative(root, coreLockPath)}`);
  fs.rmSync(corePackRoot, { recursive: true, force: true });
  fs.mkdirSync(corePackRoot, { recursive: true });
  const environment = isolatedEnvironment({
    PIP_CACHE_DIR: path.join(runtimeCacheRoot, 'pip'),
    PIP_DISABLE_PIP_VERSION_CHECK: '1',
  });
  run(interpreterPath, ['-m', 'pip', '--version'], { env: environment });
  run(interpreterPath, [
    '-m', 'pip', 'install',
    '--disable-pip-version-check',
    '--no-compile',
    '--no-build-isolation',
    '--require-hashes',
    '--target', corePackRoot,
    '--requirement', coreLockPath,
  ], { env: environment, inherit: true });
}

function verifyCore(interpreterPath, relativeInterpreter) {
  const environment = isolatedEnvironment({
    PYTHONPATH: corePackRoot,
    SCRIPTCUT_ALLOW_TOKENLESS_DEV: '1',
    SCRIPTCUT_RUNTIME_MODE: 'packaged-bundled',
    SCRIPTCUT_RUNTIME_TARGET: PYTHON_RUNTIME_ARTIFACT.target,
    SCRIPTCUT_RUNTIME_PYTHON_SOURCE: 'bundled',
    SCRIPTCUT_RUNTIME_MANIFEST_SCHEMA: 'scriptcut.runtime.v1',
  });
  const probe = [
    'import fastapi, uvicorn, pydantic, requests, numpy as np, torch, whisper',
    'a = np.ones((32, 32)); b = a @ a; assert float(b[0, 0]) == 32.0',
    'from numba import njit; f = njit(lambda x: x + 1); assert f(2) == 3',
    'x = torch.tensor([1.0, 2.0]); y = x * 2; assert y.tolist() == [2.0, 4.0]',
    'from importlib.metadata import version; assert version("openai-whisper") == "20250625"',
    'import importlib.util, sys; import main; forbidden = ("whisperx", "nemo", "pyannote.audio", "df", "mediapipe", "cv2", "openai", "anthropic", "moviepy"); assert all(name not in sys.modules for name in forbidden)',
  ].join('; ');
  run(interpreterPath, ['-c', probe], { cwd: path.join(root, 'backend'), env: environment, inherit: true });

  const inventory = run(interpreterPath, ['-c', [
    'from importlib.metadata import distributions',
    'items = sorted((d.metadata.get("Name") or "", d.version) for d in distributions() if d.metadata.get("Name"))',
    'print("\\n".join(f"{name}=={version}" for name, version in items))',
  ].join('; ')], { cwd: path.join(root, 'backend'), env: environment });
  const inventoryPath = path.join(buildRoot, 'manifests', 'core-installed-distributions.txt');
  fs.mkdirSync(path.dirname(inventoryPath), { recursive: true });
  fs.writeFileSync(inventoryPath, inventory.stdout || '', 'utf8');
  console.log(`Core distribution inventory: ${path.relative(root, inventoryPath)}`);
  return { relativeInterpreter, environment };
}

function validateTrustedModelManifest() {
  const manifest = readModelManifest(modelInputPath);
  fs.rmSync(generatedModelManifestPath, { force: true });
  return manifest;
}

function writeManifest(relativeInterpreter, version) {
  const manifest = {
    schema: 'scriptcut.runtime.v1',
    target: {
      platform: PYTHON_RUNTIME_ARTIFACT.platform,
      arch: PYTHON_RUNTIME_ARTIFACT.arch,
    },
    python: {
      version,
      executable: path.posix.join('runtime', 'python', PYTHON_RUNTIME_ARTIFACT.target, RUNTIME_RELATIVE_ROOT.split(path.sep).pop(), relativeInterpreter),
      distribution: PYTHON_RUNTIME_ARTIFACT.provider,
      build: PYTHON_RUNTIME_ARTIFACT.build,
      source: PYTHON_RUNTIME_ARTIFACT.source,
      archiveSha256: PYTHON_RUNTIME_ARTIFACT.sha256,
      profile: 'execution-only',
      buildToolingBundled: false,
      guiToolkitBundled: false,
    },
    backend: { root: 'backend' },
    packs: {
      core: path.posix.join('runtime', 'packs', 'core', PYTHON_RUNTIME_ARTIFACT.target),
      constraints: {
        source: path.relative(root, coreConstraintsPath).split(path.sep).join('/'),
        sha256: sha256(coreConstraintsPath),
      },
      lock: {
        source: path.relative(root, coreLockPath).split(path.sep).join('/'),
        sha256: sha256(coreLockPath),
        requireHashes: true,
        buildIsolation: false,
      },
    },
    security: { tokenRequired: true },
  };
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

function directorySize(directory) {
  if (!fs.existsSync(directory)) return 0;
  const stat = fs.statSync(directory);
  if (stat.isFile()) return stat.size;
  return fs.readdirSync(directory).reduce((total, entry) => total + directorySize(path.join(directory, entry)), 0);
}

function directoryStats(directory) {
  if (!fs.existsSync(directory)) return { files: 0, bytes: 0 };
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory()) return { files: 1, bytes: stat.size };
  return fs.readdirSync(directory).reduce((total, entry) => {
    const child = directoryStats(path.join(directory, entry));
    return { files: total.files + child.files, bytes: total.bytes + child.bytes };
  }, { files: 0, bytes: 0 });
}

function pruneNonRuntimeCoreArtifacts() {
  const torchIncludePath = path.join(corePackRoot, 'torch', 'include');
  if (!fs.existsSync(torchIncludePath) || !fs.statSync(torchIncludePath).isDirectory()) {
    fail(`expected pinned Torch development headers directory is missing: ${path.relative(root, torchIncludePath)}`);
  }

  const removed = directoryStats(torchIncludePath);
  fs.rmSync(torchIncludePath, { recursive: true, force: false });
  if (fs.existsSync(torchIncludePath)) {
    fail(`Torch development headers directory still exists after pruning: ${path.relative(root, torchIncludePath)}`);
  }

  console.log([
    'Pruned non-runtime Torch development headers:',
    `files=${removed.files}`,
    `bytes=${removed.bytes}`,
    `path=${path.relative(buildRoot, torchIncludePath).split(path.sep).join('/')}`,
  ].join('\n'));
  return removed;
}

function prunePythonBytecode(directory) {
  const removed = { files: 0, bytes: 0 };
  if (!fs.existsSync(directory)) return removed;

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory() && entry.name === '__pycache__') {
      const stats = directoryStats(entryPath);
      fs.rmSync(entryPath, { recursive: true, force: false });
      removed.files += stats.files;
      removed.bytes += stats.bytes;
      continue;
    }
    if (entry.isDirectory()) {
      const child = prunePythonBytecode(entryPath);
      removed.files += child.files;
      removed.bytes += child.bytes;
      continue;
    }
    if (entry.isFile() && /\.(pyc|pyo)$/i.test(entry.name)) {
      const stat = fs.statSync(entryPath);
      fs.rmSync(entryPath, { force: false });
      removed.files += 1;
      removed.bytes += stat.size;
    }
  }
  return removed;
}

function prunePackageTestArtifacts(directory) {
  const removed = { directories: 0, files: 0, bytes: 0 };
  if (!fs.existsSync(directory)) return removed;

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const entryPath = path.join(directory, entry.name);
    const relativeToCore = path.relative(corePackRoot, entryPath).split(path.sep).join('/');
    if (RUNTIME_REQUIRED_TEST_DIRECTORIES.has(relativeToCore)) continue;
    if (entry.name === 'test' || entry.name === 'tests' || entry.name === 'testing') {
      const stats = directoryStats(entryPath);
      fs.rmSync(entryPath, { recursive: true, force: false });
      removed.directories += 1;
      removed.files += stats.files;
      removed.bytes += stats.bytes;
      continue;
    }
    const child = prunePackageTestArtifacts(entryPath);
    removed.directories += child.directories;
    removed.files += child.files;
    removed.bytes += child.bytes;
  }
  return removed;
}

function prunePortableRuntimeBuildTooling() {
  const removed = { paths: 0, files: 0, bytes: 0 };
  for (const relativePath of PORTABLE_RUNTIME_BUILD_ONLY_PATHS) {
    const entryPath = path.join(runtimeRoot, ...relativePath.split('/'));
    if (!fs.lstatSync(entryPath, { throwIfNoEntry: false })) fail(`expected portable build-only path is missing: ${relativePath}`);
    const stats = directoryStats(entryPath);
    fs.rmSync(entryPath, { recursive: true, force: false });
    if (fs.lstatSync(entryPath, { throwIfNoEntry: false })) {
      fail(`portable build-only path still exists after pruning: ${relativePath}`);
    }
    removed.paths += 1;
    removed.files += stats.files;
    removed.bytes += stats.bytes;
  }
  return removed;
}

function stripNativeRuntimeSymbols() {
  const optimized = { files: 0, bytesBefore: 0, bytesAfter: 0 };
  for (const relativePath of NATIVE_RUNTIME_STRIP_TARGETS) {
    const filePath = path.join(corePackRoot, ...relativePath.split('/'));
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      fail(`expected native strip target is missing: ${relativePath}`);
    }
    const before = fs.statSync(filePath).size;
    run('/usr/bin/strip', ['-x', filePath]);
    // strip invalidates the wheel's Mach-O signature. Restore an ad-hoc staging
    // signature so local probes can load it; electron-builder signs it again.
    run('/usr/bin/codesign', ['--force', '--sign', '-', filePath]);
    run('/usr/bin/codesign', ['--verify', '--strict', filePath]);
    const after = fs.statSync(filePath).size;
    if (after >= before) fail(`native symbol stripping did not reduce ${relativePath}: ${before} -> ${after}`);
    optimized.files += 1;
    optimized.bytesBefore += before;
    optimized.bytesAfter += after;
  }
  return optimized;
}

async function main() {
  verifyTarget();
  fs.mkdirSync(buildRoot, { recursive: true });
  await ensureVerifiedArchive();
  const { interpreterPath, relativeInterpreter } = extractPython();
  verifyArchitecture(interpreterPath);
  const environment = isolatedEnvironment();
  const version = pythonVersion(interpreterPath, environment);
  installCorePack(interpreterPath);
  const coreBefore = directoryStats(corePackRoot);
  console.log(`Core pack files before pruning: ${coreBefore.files}`);
  console.log(`Core pack bytes before pruning: ${coreBefore.bytes}`);
  const headersRemoved = pruneNonRuntimeCoreArtifacts();
  const testsRemoved = prunePackageTestArtifacts(corePackRoot);
  const portableBuildToolingRemoved = prunePortableRuntimeBuildTooling();
  const nativeSymbols = stripNativeRuntimeSymbols();
  const coreAfter = directoryStats(corePackRoot);
  console.log(`Torch headers removed: ${headersRemoved.files}`);
  console.log(`Package test artifacts removed: ${testsRemoved.directories} directories, ${testsRemoved.files} files, ${testsRemoved.bytes} bytes`);
  console.log(`Portable Python build-only tooling removed: ${portableBuildToolingRemoved.paths} paths, ${portableBuildToolingRemoved.files} files, ${portableBuildToolingRemoved.bytes} bytes`);
  console.log(`Native runtime symbols stripped: ${nativeSymbols.files} files, ${nativeSymbols.bytesBefore - nativeSymbols.bytesAfter} bytes removed`);
  console.log(`Core pack files after pruning: ${coreAfter.files}`);
  console.log(`Core pack bytes after pruning: ${coreAfter.bytes}`);
  verifyCore(interpreterPath, relativeInterpreter);
  const portableBytecodeRemoved = prunePythonBytecode(runtimeRoot);
  const coreBytecodeRemoved = prunePythonBytecode(corePackRoot);
  const runtimeAfterPruning = directoryStats(runtimeRoot);
  const coreAfterPruning = directoryStats(corePackRoot);
  console.log(`Portable Python bytecode removed: ${portableBytecodeRemoved.files} files, ${portableBytecodeRemoved.bytes} bytes`);
  console.log(`Core pack bytecode removed: ${coreBytecodeRemoved.files} files, ${coreBytecodeRemoved.bytes} bytes`);
  const modelManifest = validateTrustedModelManifest();
  const manifest = writeManifest(relativeInterpreter, version);

  console.log(`Portable Python: ${path.relative(root, runtimeRoot)} (${runtimeAfterPruning.bytes} bytes)`);
  console.log(`Core pack: ${path.relative(root, corePackRoot)} (${coreAfterPruning.bytes} bytes)`);
  console.log(`Backend: backend (${directorySize(path.join(root, 'backend'))} bytes)`);
  console.log(`Runtime manifest: ${path.relative(root, manifestPath)}`);
  console.log(`Trusted model manifest: ${path.relative(root, modelInputPath)} (${modelManifest.id}, ${modelManifest.expectedBytes} bytes)`);
  console.log(`Runtime target: ${manifest.target.platform}-${manifest.target.arch}`);
  console.log(`Runtime Python: ${manifest.python.version}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
