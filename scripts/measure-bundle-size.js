#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { validateRuntimeManifest, resolveResourcePath } = require('../electron/runtime-contract');
const { readModelManifest } = require('./model-artifacts');
const { readProductVersion } = require('./release-identity');

const SCHEMA = 'scriptcut.bundle-size.v1';
const TOP_FILE_LIMIT = 30;
const TOP_DIRECTORY_LIMIT = 30;
const root = path.join(__dirname, '..');

function fail(message) {
  throw new Error(`Bundle-size measurement failed: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`${label} could not be read as JSON: ${error.message}`);
  }
}

function currentGitCommit() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (result.status !== 0) fail('could not determine the current commit');
  return result.stdout.trim();
}

function lstat(filePath, label) {
  try {
    return fs.lstatSync(filePath);
  } catch (error) {
    fail(`${label} could not be inspected: ${error.message}`);
  }
}

function assertDirectory(directory, label) {
  assert(fs.existsSync(directory) && lstat(directory, label).isDirectory(), `${label} is missing or not a directory: ${directory}`);
}

function assertRegularFile(filePath, label) {
  assert(fs.existsSync(filePath) && lstat(filePath, label).isFile(), `${label} is missing or not a regular file: ${filePath}`);
}

function relativePath(appPath, filePath) {
  const relative = path.relative(appPath, filePath).split(path.sep).join('/');
  assert(relative && relative !== '..' && !relative.startsWith('../'), `path escaped app root: ${filePath}`);
  return relative;
}

function isWithin(filePath, directory) {
  const relative = path.relative(directory, filePath);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

function parseCsvLine(line) {
  const values = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted && character === '"' && line[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      values.push(value);
      value = '';
    } else {
      value += character;
    }
  }
  values.push(value);
  return values;
}

function normalizeRecordPath(value) {
  const normalized = value.replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('/') || normalized.split('/').includes('..')) return null;
  return path.posix.normalize(normalized);
}

function walkTree(directory, appPath, files = [], symlinks = [], directories = new Map()) {
  const entries = fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    const relative = relativePath(appPath, entryPath);
    if (entry.isSymbolicLink()) {
      const stat = lstat(entryPath, entryPath);
      symlinks.push({ relativePath: relative, logicalBytes: stat.size });
      continue;
    }
    if (entry.isDirectory()) {
      const depth = relative.split('/').length;
      if (depth <= 4) directories.set(relative, { relativePath: relative, logicalBytes: 0, fileCount: 0 });
      walkTree(entryPath, appPath, files, symlinks, directories);
      continue;
    }
    const stat = lstat(entryPath, entryPath);
    if (!stat.isFile()) continue;
    const file = {
      absolutePath: entryPath,
      relativePath: relative,
      logicalBytes: stat.size,
      dev: Number.isInteger(stat.dev) ? stat.dev : null,
      ino: Number.isInteger(stat.ino) ? stat.ino : null,
    };
    files.push(file);
    const parts = relative.split('/');
    for (let count = 1; count < parts.length && count <= 4; count += 1) {
      const directoryPath = parts.slice(0, count).join('/');
      const record = directories.get(directoryPath) || { relativePath: directoryPath, logicalBytes: 0, fileCount: 0 };
      record.logicalBytes += stat.size;
      record.fileCount += 1;
      directories.set(directoryPath, record);
    }
  }
  return { files, symlinks, directories };
}

function hardLinkAccounting(files) {
  const available = files.every((file) => file.dev !== null && file.ino !== null);
  if (!available) {
    return {
      available: false,
      logicalBytes: files.reduce((total, file) => total + file.logicalBytes, 0),
      uniqueInodeBytes: null,
      duplicateRegularFileCount: null,
    };
  }
  const seen = new Map();
  let uniqueInodeBytes = 0;
  let duplicateRegularFileCount = 0;
  for (const file of files) {
    const key = `${file.dev}:${file.ino}`;
    if (seen.has(key)) duplicateRegularFileCount += 1;
    else {
      seen.set(key, file.logicalBytes);
      uniqueInodeBytes += file.logicalBytes;
    }
  }
  return {
    available: true,
    logicalBytes: files.reduce((total, file) => total + file.logicalBytes, 0),
    uniqueInodeBytes,
    duplicateRegularFileCount,
  };
}

function categoryForFile(file, roots) {
  const resourceRoots = roots.resourceRoots;
  if (isWithin(file.absolutePath, roots.frameworksRoot)) return 'electronFrameworks';
  if (isWithin(file.absolutePath, roots.macosRoot)) return 'macosExecutables';
  if (file.absolutePath === roots.appAsarPath) return 'appAsar';
  if (isWithin(file.absolutePath, roots.backendRoot)) return 'backend';
  if (isWithin(file.absolutePath, roots.ffmpegBinRoot)) return 'ffmpegBin';
  if (isWithin(file.absolutePath, roots.pythonCorePackRoot)) return 'pythonCorePack';
  if (isWithin(file.absolutePath, roots.portablePythonRoot)) return 'portablePython';
  if (isWithin(file.absolutePath, roots.manifestsRoot)) return 'manifests';
  if (roots.licenseRoots.some((licenseRoot) => isWithin(file.absolutePath, licenseRoot))) return 'licensesAndNotices';
  if (isWithin(file.absolutePath, resourceRoots)) return 'otherResources';
  return 'otherAppContents';
}

function primaryCategories(files, roots) {
  const totals = new Map([
    ['electronFrameworks', { name: 'electronFrameworks', logicalBytes: 0, fileCount: 0 }],
    ['macosExecutables', { name: 'macosExecutables', logicalBytes: 0, fileCount: 0 }],
    ['appAsar', { name: 'appAsar', logicalBytes: 0, fileCount: 0 }],
    ['backend', { name: 'backend', logicalBytes: 0, fileCount: 0 }],
    ['ffmpegBin', { name: 'ffmpegBin', logicalBytes: 0, fileCount: 0 }],
    ['portablePython', { name: 'portablePython', logicalBytes: 0, fileCount: 0 }],
    ['pythonCorePack', { name: 'pythonCorePack', logicalBytes: 0, fileCount: 0 }],
    ['manifests', { name: 'manifests', logicalBytes: 0, fileCount: 0 }],
    ['licensesAndNotices', { name: 'licensesAndNotices', logicalBytes: 0, fileCount: 0 }],
    ['otherResources', { name: 'otherResources', logicalBytes: 0, fileCount: 0 }],
    ['otherAppContents', { name: 'otherAppContents', logicalBytes: 0, fileCount: 0 }],
  ]);
  for (const file of files) {
    const category = totals.get(categoryForFile(file, roots));
    category.logicalBytes += file.logicalBytes;
    category.fileCount += 1;
  }
  return [...totals.values()].sort((left, right) => right.logicalBytes - left.logicalBytes || left.name.localeCompare(right.name));
}

function distributionMetadata(distInfoPath) {
  const metadataPath = path.join(distInfoPath, 'METADATA');
  let name;
  let version;
  if (fs.existsSync(metadataPath)) {
    const metadata = fs.readFileSync(metadataPath, 'utf8');
    name = metadata.match(/^Name:\s*(.+)$/mi)?.[1]?.trim();
    version = metadata.match(/^Version:\s*(.+)$/mi)?.[1]?.trim();
  }
  const directoryName = path.basename(distInfoPath).replace(/\.dist-info$/, '');
  const separator = directoryName.lastIndexOf('-');
  return {
    name: name || (separator > 0 ? directoryName.slice(0, separator) : directoryName),
    version: version || (separator > 0 ? directoryName.slice(separator + 1) : 'unknown'),
  };
}

function findDistInfos(directory, found = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (!entry.isDirectory()) continue;
    if (entry.name.endsWith('.dist-info')) {
      found.push(entryPath);
      continue;
    }
    findDistInfos(entryPath, found);
  }
  return found;
}

function distributionAttribution(coreRoot, coreFiles) {
  const byRelativePath = new Map(coreFiles.map((file) => [path.relative(coreRoot, file.absolutePath).split(path.sep).join('/'), file]));
  const claims = new Map();
  const distributions = [];
  for (const distInfoPath of findDistInfos(coreRoot)) {
    const metadata = distributionMetadata(distInfoPath);
    const id = path.relative(coreRoot, distInfoPath).split(path.sep).join('/');
    const recordPath = path.join(distInfoPath, 'RECORD');
    const claimedPaths = new Set();
    if (fs.existsSync(recordPath)) {
      for (const line of fs.readFileSync(recordPath, 'utf8').split(/\r?\n/).filter(Boolean)) {
        const record = parseCsvLine(line);
        const recordRelative = normalizeRecordPath(record[0] || '');
        if (!recordRelative || !byRelativePath.has(recordRelative)) continue;
        claimedPaths.add(recordRelative);
        const owners = claims.get(recordRelative) || [];
        if (!owners.some((owner) => owner.id === id)) owners.push({ id, name: metadata.name, version: metadata.version });
        claims.set(recordRelative, owners);
      }
    }
    distributions.push({ id, ...metadata, claimedPaths });
  }

  const ownersByPath = new Map();
  const conflicts = [];
  for (const [recordRelative, owners] of claims.entries()) {
    const sortedOwners = [...owners].sort((left, right) => left.id.localeCompare(right.id));
    ownersByPath.set(recordRelative, sortedOwners[0].id);
    if (sortedOwners.length > 1) {
      conflicts.push({
        relativePath: recordRelative,
        owner: sortedOwners[0].name,
        distributions: sortedOwners.map((owner) => ({ name: owner.name, version: owner.version })),
      });
    }
  }

  const entries = distributions.map((distribution) => {
    const ownedFiles = [...distribution.claimedPaths]
      .filter((recordRelative) => ownersByPath.get(recordRelative) === distribution.id)
      .map((recordRelative) => byRelativePath.get(recordRelative));
    return {
      name: distribution.name,
      version: distribution.version,
      logicalBytes: ownedFiles.reduce((total, file) => total + file.logicalBytes, 0),
      fileCount: ownedFiles.length,
      files: ownedFiles,
    };
  }).sort((left, right) => right.logicalBytes - left.logicalBytes || left.name.localeCompare(right.name) || left.version.localeCompare(right.version));

  const attributedDistributionBytes = entries.reduce((total, entry) => total + entry.logicalBytes, 0);
  const coreLogicalBytes = coreFiles.reduce((total, file) => total + file.logicalBytes, 0);
  return {
    topDistributions: entries.map(({ files, ...entry }) => entry),
    attributedDistributionBytes,
    unattributedCorePackBytes: coreLogicalBytes - attributedDistributionBytes,
    ownershipConflicts: conflicts.sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
    distributionFiles: new Map(entries.map((entry) => [`${entry.name}\u0000${entry.version}`, entry.files])),
  };
}

function torchAttribution(distributionResult, coreRoot) {
  const torchEntry = distributionResult.topDistributions.find((entry) => entry.name.toLowerCase() === 'torch');
  const torchFiles = torchEntry
    ? (distributionResult.distributionFiles.get(`${torchEntry.name}\u0000${torchEntry.version}`) || [])
    : [];
  const largestFiles = torchFiles
    .map((file) => ({ relativePath: path.relative(coreRoot, file.absolutePath).split(path.sep).join('/'), logicalBytes: file.logicalBytes }))
    .sort((left, right) => right.logicalBytes - left.logicalBytes || left.relativePath.localeCompare(right.relativePath))
    .slice(0, 10);
  const libBytes = torchFiles
    .filter((file) => isWithin(file.absolutePath, path.join(coreRoot, 'torch', 'lib')))
    .reduce((total, file) => total + file.logicalBytes, 0);
  const totalBytes = torchFiles.reduce((total, file) => total + file.logicalBytes, 0);
  return {
    present: Boolean(torchEntry),
    torchTotal: totalBytes,
    torchLib: libBytes,
    torchPythonSourceOrPackageRemainder: totalBytes - libBytes,
    largestTorchFiles: largestFiles,
  };
}

function percentDelta(current, baseline) {
  return baseline === 0 ? null : (current - baseline) / baseline * 100;
}

function compareReports(current, baselinePath) {
  const baseline = readJson(baselinePath, 'baseline report');
  assert(baseline.schema === SCHEMA, `baseline schema must be ${SCHEMA}`);
  assert(baseline.platform === current.platform, `baseline platform ${baseline.platform} does not match ${current.platform}`);
  assert(baseline.architecture === current.architecture, `baseline architecture ${baseline.architecture} does not match ${current.architecture}`);
  const metric = (key) => ({
    baseline: baseline[key],
    current: current[key],
    delta: current[key] - baseline[key],
    percentDelta: percentDelta(current[key], baseline[key]),
  });
  const baselineCategories = new Map((baseline.primaryCategories || []).map((category) => [category.name, category.logicalBytes]));
  const currentCategories = new Map((current.primaryCategories || []).map((category) => [category.name, category.logicalBytes]));
  const categoryNames = [...new Set([...baselineCategories.keys(), ...currentCategories.keys()])].sort();
  return {
    baseline: {
      schema: baseline.schema,
      productVersion: baseline.productVersion,
      commit: baseline.commit,
      platform: baseline.platform,
      architecture: baseline.architecture,
    },
    appLogicalBytes: metric('appLogicalBytes'),
    dmgBytes: metric('dmgBytes'),
    primaryCategories: categoryNames.map((name) => {
      const baselineBytes = baselineCategories.get(name) || 0;
      const currentBytes = currentCategories.get(name) || 0;
      return { name, baseline: baselineBytes, current: currentBytes, delta: currentBytes - baselineBytes, percentDelta: percentDelta(currentBytes, baselineBytes) };
    }),
  };
}

function formatMiB(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

function appendGitHubSummary(report) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  const categories = report.primaryCategories.slice(0, 5).map((category) => `| ${category.name} | ${category.logicalBytes} bytes (${formatMiB(category.logicalBytes)}) |`).join('\n');
  const largestCategory = report.summary.largestPrimaryCategory;
  const largestDistribution = report.summary.largestPythonDistribution;
  fs.appendFileSync(summaryPath, [
    '## ScriptCut bundle-size evidence',
    '',
    `- App logical size: ${report.appLogicalBytes} bytes (${formatMiB(report.appLogicalBytes)})`,
    `- DMG size: ${report.dmgBytes} bytes (${formatMiB(report.dmgBytes)})`,
    `- Compression ratio (DMG bytes / app logical bytes): ${report.compressionRatio}`,
    `- Largest primary category: ${largestCategory.name} (${largestCategory.logicalBytes} bytes / ${formatMiB(largestCategory.logicalBytes)})`,
    `- Largest Python distribution: ${largestDistribution ? `${largestDistribution.name} ${largestDistribution.version} (${largestDistribution.logicalBytes} bytes / ${formatMiB(largestDistribution.logicalBytes)})` : 'none'}`,
    '',
    '| Top primary category | Logical bytes |',
    '| --- | ---: |',
    categories,
    '',
  ].join('\n'));
}

function measureBundleSize(options) {
  const appPath = path.resolve(options.appPath);
  const dmgPath = path.resolve(options.dmgPath);
  assertDirectory(appPath, 'ScriptCut.app');
  assertRegularFile(dmgPath, 'candidate DMG');

  const contentsPath = path.join(appPath, 'Contents');
  const resourcesPath = path.join(contentsPath, 'Resources');
  const frameworksRoot = path.join(contentsPath, 'Frameworks');
  const macosRoot = path.join(contentsPath, 'MacOS');
  const manifestPath = path.join(resourcesPath, 'manifests', 'runtime-manifest.json');
  const modelManifestPath = path.join(resourcesPath, 'manifests', 'model-manifest.json');
  assertDirectory(contentsPath, 'Contents');
  assertDirectory(resourcesPath, 'Contents/Resources');
  assertDirectory(frameworksRoot, 'Contents/Frameworks');
  assertDirectory(macosRoot, 'Contents/MacOS');
  assertRegularFile(manifestPath, 'runtime manifest');
  assertRegularFile(modelManifestPath, 'model manifest');

  let normalized;
  try {
    normalized = validateRuntimeManifest(readJson(manifestPath, 'runtime manifest'));
  } catch (error) {
    fail(error.message);
  }
  const backendRoot = resolveResourcePath(resourcesPath, normalized.backend.root, 'backend root');
  const pythonCorePackRoot = resolveResourcePath(resourcesPath, normalized.packs.core, 'core pack root');
  const pythonExecutablePath = resolveResourcePath(resourcesPath, normalized.python.executable, 'Python executable');
  const portablePythonRoot = path.dirname(path.dirname(pythonExecutablePath));
  const ffmpegBinRoot = path.join(resourcesPath, 'bin');
  const manifestsRoot = path.join(resourcesPath, 'manifests');
  const appAsarPath = path.join(resourcesPath, 'app.asar');
  for (const [directory, label] of [
    [backendRoot, 'backend root'],
    [pythonCorePackRoot, 'core pack root'],
    [portablePythonRoot, 'portable Python root'],
    [ffmpegBinRoot, 'FFmpeg/bin root'],
    [manifestsRoot, 'manifests root'],
  ]) assertDirectory(directory, label);
  assertRegularFile(appAsarPath, 'Contents/Resources/app.asar');
  assert(isWithin(backendRoot, resourcesPath) && isWithin(pythonCorePackRoot, resourcesPath) && isWithin(portablePythonRoot, resourcesPath), 'runtime manifest path escapes Resources');

  const licenseRoots = [
    path.join(resourcesPath, 'LICENSE'),
    path.join(resourcesPath, 'THIRD_PARTY_NOTICES.md'),
    path.join(resourcesPath, 'ACKNOWLEDGEMENTS.md'),
    path.join(resourcesPath, 'LICENSES'),
  ].filter((candidate) => fs.existsSync(candidate));
  const roots = {
    frameworksRoot,
    macosRoot,
    appAsarPath,
    backendRoot,
    ffmpegBinRoot,
    portablePythonRoot,
    pythonCorePackRoot,
    manifestsRoot,
    licenseRoots,
    resourceRoots: resourcesPath,
  };

  const walked = walkTree(appPath, appPath);
  const categoryList = primaryCategories(walked.files, roots);
  const appLogicalBytes = walked.files.reduce((total, file) => total + file.logicalBytes, 0);
  const categoryLogicalBytes = categoryList.reduce((total, category) => total + category.logicalBytes, 0);
  assert(categoryLogicalBytes === appLogicalBytes, `primary categories reconcile to ${categoryLogicalBytes}, expected ${appLogicalBytes}`);
  const coreFiles = walked.files.filter((file) => isWithin(file.absolutePath, pythonCorePackRoot));
  const distributionResult = distributionAttribution(pythonCorePackRoot, coreFiles);
  const torch = torchAttribution(distributionResult, pythonCorePackRoot);
  const largestFiles = walked.files
    .map((file) => ({ relativePath: file.relativePath, logicalBytes: file.logicalBytes, primaryCategory: categoryForFile(file, roots) }))
    .sort((left, right) => right.logicalBytes - left.logicalBytes || left.relativePath.localeCompare(right.relativePath))
    .slice(0, TOP_FILE_LIMIT);
  const directoryHotspots = [...walked.directories.values()]
    .map((directory) => ({ ...directory, depth: directory.relativePath.split('/').length }))
    .sort((left, right) => right.logicalBytes - left.logicalBytes || left.relativePath.localeCompare(right.relativePath))
    .slice(0, TOP_DIRECTORY_LIMIT);
  const modelManifest = readModelManifest(modelManifestPath);
  const report = {
    schema: SCHEMA,
    productVersion: options.productVersion || readProductVersion(),
    commit: options.commit || currentGitCommit(),
    platform: normalized.target.platform,
    architecture: normalized.target.arch,
    generatedAt: options.generatedAt || new Date().toISOString(),
    appLogicalBytes,
    appUniqueInodeBytes: hardLinkAccounting(walked.files).uniqueInodeBytes,
    dmgBytes: fs.statSync(dmgPath).size,
    compressionRatio: fs.statSync(dmgPath).size / appLogicalBytes,
    embeddedModelWeights: false,
    baselineModelExpectedBytes: modelManifest.expectedBytes,
    runtimePaths: {
      portablePython: relativePath(appPath, portablePythonRoot),
      pythonCorePack: relativePath(appPath, pythonCorePackRoot),
      backend: relativePath(appPath, backendRoot),
      ffmpegBin: relativePath(appPath, ffmpegBinRoot),
      manifests: relativePath(appPath, manifestsRoot),
    },
    primaryCategories: categoryList,
    attributedDistributionBytes: distributionResult.attributedDistributionBytes,
    unattributedCorePackBytes: distributionResult.unattributedCorePackBytes,
    topDistributions: distributionResult.topDistributions,
    distributionOwnershipConflicts: distributionResult.ownershipConflicts,
    torch,
    largestFiles,
    directoryHotspots,
    hardLinkAccounting: hardLinkAccounting(walked.files),
    symlinkDiagnostics: {
      symlinkCount: walked.symlinks.length,
      symlinkLogicalBytes: walked.symlinks.reduce((total, symlink) => total + symlink.logicalBytes, 0),
    },
  };
  report.summary = {
    largestPrimaryCategory: categoryList[0] || null,
    largestPythonDistribution: report.topDistributions[0] || null,
    largestFile: report.largestFiles[0] || null,
  };
  if (options.baselinePath) report.comparison = compareReports(report, path.resolve(options.baselinePath));
  if (options.outputPath) {
    fs.mkdirSync(path.dirname(path.resolve(options.outputPath)), { recursive: true });
    fs.writeFileSync(path.resolve(options.outputPath), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  appendGitHubSummary(report);
  return report;
}

function main() {
  const appPath = optionValue('--app');
  const dmgPath = optionValue('--dmg');
  const outputPath = optionValue('--output');
  assert(appPath && dmgPath && outputPath, 'usage: node scripts/measure-bundle-size.js --app <ScriptCut.app> --dmg <candidate.dmg> --output <bundle-size-report.json>');
  const report = measureBundleSize({ appPath, dmgPath, outputPath, baselinePath: optionValue('--baseline') });
  console.log(`Bundle-size report: ${path.relative(root, path.resolve(outputPath))}`);
  console.log(`App logical size: ${report.appLogicalBytes} bytes (${formatMiB(report.appLogicalBytes)})`);
  console.log(`DMG size: ${report.dmgBytes} bytes (${formatMiB(report.dmgBytes)})`);
  console.log(`Compression ratio: ${report.compressionRatio}`);
  console.log(`Largest primary category: ${report.summary.largestPrimaryCategory.name}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

module.exports = {
  SCHEMA,
  measureBundleSize,
  hardLinkAccounting,
  parseCsvLine,
};
