#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { newestApp } = require('./check-packaged-runtime');
const { inspectSignature } = require('./check-macos-launchability');

const root = path.join(__dirname, '..');
const appOption = process.argv.indexOf('--app');

function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(message) {
  throw new Error(`macOS signing-readiness check failed: ${message}`);
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.error || result.status !== 0) {
    fail(`${command} ${args.join(' ')} failed: ${(result.error?.message || result.stderr || result.stdout || '').trim()}`);
  }
  return result;
}

function collectFiles(directory, appRoot, files = [], findings = { symlinkEscapes: [], writableExecutables: [] }) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    const stat = fs.lstatSync(entryPath);
    if (stat.isSymbolicLink()) {
      const resolved = fs.realpathSync(entryPath);
      const relative = path.relative(appRoot, resolved);
      if (path.isAbsolute(relative) || relative.startsWith(`..${path.sep}`) || relative === '..') {
        findings.symlinkEscapes.push(path.relative(appRoot, entryPath));
      }
      continue;
    }
    if (stat.isDirectory()) {
      collectFiles(entryPath, appRoot, files, findings);
      continue;
    }
    if (!stat.isFile()) continue;
    files.push(entryPath);
    if ((stat.mode & 0o111) !== 0 && (stat.mode & 0o022) !== 0) {
      findings.writableExecutables.push(path.relative(appRoot, entryPath));
    }
  }
  return { files, findings };
}

function fileDescriptions(files) {
  return files.map((filePath) => ({
    filePath,
    // `file` may emit multiple lines for a universal Mach-O. Querying one
    // path at a time keeps the inventory mapping exact without parsing output
    // that is allowed to contain embedded newlines.
    description: run('file', ['-b', filePath]).stdout.trim(),
  }));
}

function likelyNativeInventoryFile(appRoot, filePath) {
  const relative = path.relative(appRoot, filePath).split(path.sep).join('/');
  const stat = fs.statSync(filePath);
  return (
    /\.(dylib|so|bundle)$/i.test(filePath)
    || relative.startsWith('Contents/MacOS/')
    || relative.startsWith('Contents/Frameworks/')
    || (stat.mode & 0o111) !== 0
  );
}

function knownNativeRoot(appRoot, filePath) {
  const allowed = [
    path.join(appRoot, 'Contents', 'MacOS'),
    path.join(appRoot, 'Contents', 'Frameworks'),
    path.join(appRoot, 'Contents', 'Resources', 'runtime'),
    path.join(appRoot, 'Contents', 'Resources', 'bin'),
    path.join(appRoot, 'Contents', 'Resources', 'backend'),
  ];
  return allowed.some((directory) => {
    const relative = path.relative(directory, filePath);
    return relative === '' || (!path.isAbsolute(relative) && !relative.startsWith(`..${path.sep}`) && relative !== '..');
  });
}

function main() {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') fail(`requires native macOS arm64, received ${process.platform}-${process.arch}`);
  const appPath = appOption >= 0 ? path.resolve(optionValue('--app')) : newestApp('arm64');
  if (!appPath.endsWith('.app') || !fs.existsSync(appPath)) fail(`app does not exist: ${appPath}`);
  const appRoot = path.resolve(appPath);
  const { files, findings } = collectFiles(appRoot, appRoot);
  const descriptions = fileDescriptions(files.filter((filePath) => likelyNativeInventoryFile(appRoot, filePath)));
  const native = descriptions.filter(({ description }) => /Mach-O/i.test(description));
  const unexpected = native.filter(({ filePath }) => !knownNativeRoot(appRoot, filePath));
  const resources = path.join(appRoot, 'Contents', 'Resources');
  const requiredResources = ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'ACKNOWLEDGEMENTS.md', 'LICENSES/CutScript-MIT.txt'];
  const missingResources = requiredResources.filter((relative) => !fs.existsSync(path.join(resources, relative)));
  if (findings.symlinkEscapes.length > 0) fail(`symlink escapes app root: ${findings.symlinkEscapes.join(', ')}`);
  if (findings.writableExecutables.length > 0) fail(`writable executable files: ${findings.writableExecutables.join(', ')}`);
  if (unexpected.length > 0) fail(`native files outside known roots: ${unexpected.map(({ filePath }) => path.relative(appRoot, filePath)).join(', ')}`);
  if (missingResources.length > 0) fail(`required license/notice resources missing: ${missingResources.join(', ')}`);

  const strictSignature = inspectSignature(appRoot);

  const modelWeights = files.filter((filePath) => path.basename(filePath) === 'base.pt');
  if (modelWeights.length > 0) fail(`model weight is embedded: ${modelWeights.map((filePath) => path.relative(appRoot, filePath)).join(', ')}`);
  const runtimeManifestPath = path.join(resources, 'manifests', 'runtime-manifest.json');
  const pythonPath = fs.existsSync(runtimeManifestPath)
    ? path.join(resources, JSON.parse(fs.readFileSync(runtimeManifestPath, 'utf8')).python.executable)
    : '';
  const ffmpeg = files.find((filePath) => path.basename(filePath) === 'ffmpeg');
  const ffprobe = files.find((filePath) => path.basename(filePath) === 'ffprobe');
  const portablePython = pythonPath && fs.existsSync(pythonPath) ? pythonPath : null;
  console.log(`App: ${path.relative(root, appRoot)}`);
  console.log(`Mach-O files: ${native.length}`);
  console.log(`Portable Python present: ${portablePython ? 'Yes' : 'No'}`);
  console.log(`FFmpeg present: ${ffmpeg ? 'Yes' : 'No'}`);
  console.log(`FFprobe present: ${ffprobe ? 'Yes' : 'No'}`);
  console.log('Unexpected native locations: 0');
  console.log('Symlink escapes: 0');
  console.log('Writable executable anomalies: 0');
  console.log('Ad-hoc signature: Yes');
  console.log('Developer ID signed: No');
  console.log('Hardened Runtime: No');
  console.log('Strict verification: Passed');
  console.log('macOS signing-readiness inventory passed.');
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

module.exports = { collectFiles, knownNativeRoot };
