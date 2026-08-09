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
    '--target', corePackRoot,
    '--requirement', coreInputPath,
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
    'import fastapi, uvicorn, pydantic, requests, torch, whisper',
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
    },
    backend: { root: 'backend' },
    packs: { core: path.posix.join('runtime', 'packs', 'core', PYTHON_RUNTIME_ARTIFACT.target) },
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

async function main() {
  verifyTarget();
  fs.mkdirSync(buildRoot, { recursive: true });
  await ensureVerifiedArchive();
  const { interpreterPath, relativeInterpreter } = extractPython();
  verifyArchitecture(interpreterPath);
  const environment = isolatedEnvironment();
  const version = pythonVersion(interpreterPath, environment);
  installCorePack(interpreterPath);
  verifyCore(interpreterPath, relativeInterpreter);
  const modelManifest = validateTrustedModelManifest();
  const manifest = writeManifest(relativeInterpreter, version);

  console.log(`Portable Python: ${path.relative(root, runtimeRoot)} (${directorySize(runtimeRoot)} bytes)`);
  console.log(`Core pack: ${path.relative(root, corePackRoot)} (${directorySize(corePackRoot)} bytes)`);
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
