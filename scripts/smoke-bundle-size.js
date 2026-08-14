#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { SCHEMA, measureBundleSize } = require('./measure-bundle-size');

function write(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function manifest() {
  return {
    schema: 'scriptcut.runtime.v1',
    target: { platform: process.platform === 'darwin' ? 'darwin' : 'linux', arch: process.arch === 'arm64' ? 'arm64' : 'x64' },
    python: { version: '3.11.15', executable: 'runtime/python/darwin-arm64/3.11.15+20260807/bin/python3.11' },
    backend: { root: 'backend' },
    packs: { core: 'runtime/packs/core/darwin-arm64' },
    security: { tokenRequired: true },
  };
}

function makeFixture(tempRoot) {
  const app = path.join(tempRoot, 'ScriptCut.app');
  const contents = path.join(app, 'Contents');
  const resources = path.join(contents, 'Resources');
  const pythonRoot = path.join(resources, 'runtime', 'python', 'darwin-arm64', '3.11.15+20260807');
  const coreRoot = path.join(resources, 'runtime', 'packs', 'core', 'darwin-arm64');
  const shared = path.join(coreRoot, 'shared.py');
  fs.mkdirSync(path.join(contents, 'Frameworks', 'Fixture.framework', 'Versions', 'A'), { recursive: true });
  write(path.join(contents, 'Frameworks', 'Fixture.framework', 'Versions', 'A', 'large.bin'), Buffer.alloc(48, 1));
  fs.symlinkSync('A', path.join(contents, 'Frameworks', 'Fixture.framework', 'Versions', 'Current'));
  write(path.join(contents, 'MacOS', 'ScriptCut'), Buffer.alloc(20, 2));
  write(path.join(resources, 'app.asar'), Buffer.alloc(32, 3));
  write(path.join(resources, 'backend', 'main.py'), Buffer.alloc(18, 4));
  write(path.join(resources, 'bin', 'ffmpeg'), Buffer.alloc(22, 5));
  write(path.join(resources, 'LICENSE'), 'license');
  write(path.join(resources, 'manifests', 'runtime-manifest.json'), `${JSON.stringify(manifest())}\n`);
  write(path.join(resources, 'manifests', 'model-manifest.json'), `${JSON.stringify({
    schema: 'scriptcut.model.v1',
    id: 'whisper-base',
    engine: 'whisper',
    model: 'base',
    revision: 'ed3a0b6b1c0edf879ad9b11b1af5a0e6ab5db9205f891f668f8b0e6c6326e34e',
    filename: 'base.pt',
    sourceUrl: 'https://openaipublic.azureedge.net/main/whisper/models/base.pt',
    sha256: 'ed3a0b6b1c0edf879ad9b11b1af5a0e6ab5db9205f891f668f8b0e6c6326e34e',
    expectedBytes: 1234,
    license: 'MIT',
    sourceProject: 'openai/whisper',
    codeVersion: '20250625',
  })}\n`);
  write(path.join(pythonRoot, 'bin', 'python3.11'), Buffer.alloc(16, 6));
  fs.symlinkSync('python3.11', path.join(pythonRoot, 'bin', 'python3'));
  write(path.join(coreRoot, 'torch', 'lib', 'libtorch.dylib'), Buffer.alloc(60, 7));
  write(path.join(coreRoot, 'torch', '__init__.py'), Buffer.alloc(14, 8));
  write(shared, Buffer.alloc(11, 9));
  write(path.join(coreRoot, 'unowned.dat'), Buffer.alloc(9, 10));
  const distA = path.join(coreRoot, 'alpha_pkg-1.0.dist-info');
  const distB = path.join(coreRoot, 'beta_pkg-2.0.dist-info');
  const distTorch = path.join(coreRoot, 'torch-3.0.dist-info');
  write(path.join(distA, 'METADATA'), 'Name: alpha-pkg\nVersion: 1.0\n');
  write(path.join(distB, 'METADATA'), 'Name: beta-pkg\nVersion: 2.0\n');
  write(path.join(distA, 'RECORD'), 'shared.py,,11\n');
  write(path.join(distB, 'RECORD'), 'shared.py,,11\n');
  write(path.join(distTorch, 'METADATA'), 'Name: torch\nVersion: 3.0\n');
  write(path.join(distTorch, 'RECORD'), 'torch/lib/libtorch.dylib,,60\ntorch/__init__.py,,14\n');
  const dmg = path.join(tempRoot, 'candidate.dmg');
  write(dmg, Buffer.alloc(100, 11));
  return { app, dmg, resources, coreRoot, shared };
}

function expectFailure(callback, label) {
  assert.throws(callback, /Bundle-size measurement failed/, label);
}

function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scriptcut-bundle-size-'));
  try {
    const fixture = makeFixture(tempRoot);
    const baselinePath = path.join(tempRoot, 'baseline.json');
    const report = measureBundleSize({
      appPath: fixture.app,
      dmgPath: fixture.dmg,
      outputPath: baselinePath,
      productVersion: '0.1.0',
      commit: 'a'.repeat(40),
      generatedAt: '2026-01-01T00:00:00.000Z',
    });
    assert.strictEqual(report.schema, SCHEMA);
    assert.strictEqual(report.appLogicalBytes, report.primaryCategories.reduce((sum, category) => sum + category.logicalBytes, 0));
    assert(report.symlinkDiagnostics.symlinkCount >= 2);
    assert(!/(\/Users\/|\/private\/|\/tmp\/|RUNNER_TEMP)/.test(JSON.stringify(report)));
    assert(report.largestFiles.every((file, index, files) => index === 0 || files[index - 1].logicalBytes >= file.logicalBytes));
    assert(report.topDistributions.every((distribution) => distribution.logicalBytes >= 0));
    assert(report.distributionOwnershipConflicts.some((conflict) => conflict.relativePath === 'shared.py'));
    assert.strictEqual(report.unattributedCorePackBytes, report.primaryCategories.find((category) => category.name === 'pythonCorePack').logicalBytes - report.attributedDistributionBytes);
    assert.strictEqual(report.torch.torchTotal, 74);
    assert.strictEqual(report.torch.torchLib, 60);

    fs.appendFileSync(path.join(fixture.resources, 'backend', 'larger.py'), Buffer.alloc(13, 12));
    const comparisonPath = path.join(tempRoot, 'comparison.json');
    const comparison = measureBundleSize({
      appPath: fixture.app,
      dmgPath: fixture.dmg,
      outputPath: comparisonPath,
      productVersion: '0.1.0',
      commit: 'c'.repeat(40),
      generatedAt: '2026-01-02T00:00:00.000Z',
      baselinePath,
    });
    assert(comparison.comparison.appLogicalBytes.delta > 0);
    assert(comparison.comparison.appLogicalBytes.percentDelta > 0);
    assert.strictEqual(comparison.comparison.baseline.schema, SCHEMA);
    assert.strictEqual(JSON.parse(fs.readFileSync(comparisonPath, 'utf8')).schema, SCHEMA);

    const wrongArchitecturePath = path.join(tempRoot, 'wrong-architecture.json');
    fs.writeFileSync(wrongArchitecturePath, JSON.stringify({ ...report, architecture: report.architecture === 'arm64' ? 'x64' : 'arm64' }));
    expectFailure(() => measureBundleSize({ appPath: fixture.app, dmgPath: fixture.dmg, productVersion: '0.1.0', commit: 'd'.repeat(40), baselinePath: wrongArchitecturePath }), 'architecture mismatch baseline');

    const missingPath = path.join(fixture.resources, 'bin');
    fs.rmSync(missingPath, { recursive: true });
    expectFailure(() => measureBundleSize({ appPath: fixture.app, dmgPath: fixture.dmg, productVersion: '0.1.0', commit: 'e'.repeat(40) }), 'missing required package path');
    fs.mkdirSync(missingPath, { recursive: true });
    write(path.join(missingPath, 'ffmpeg'), Buffer.alloc(22, 5));

    console.log('Bundle-size measurement schema, logical-byte walk, symlink handling, category reconciliation, distribution accounting, hotspots, and baseline comparison tests passed.');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
