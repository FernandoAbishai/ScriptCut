import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const __dirname = dirname(fileURLToPath(import.meta.url));
const sourceFor = (relativePath) => readFileSync(resolve(__dirname, relativePath), 'utf8');
const moduleCache = new Map();

function loadTsModule(relativePath) {
  const absolutePath = relativePath.startsWith('/') ? relativePath : resolve(__dirname, relativePath);
  if (moduleCache.has(absolutePath)) return moduleCache.get(absolutePath).exports;

  if (absolutePath.endsWith('/store/editorStore.ts') || absolutePath.endsWith('/store/aiStore.ts')) {
    return {};
  }

  const source = readFileSync(absolutePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  });
  const module = { exports: {} };
  moduleCache.set(absolutePath, module);
  const localRequire = (request) => {
    if (request.startsWith('.')) {
      const requestPath = resolve(dirname(absolutePath), request);
      const candidates = [requestPath, `${requestPath}.ts`, `${requestPath}.tsx`, `${requestPath}.js`];
      const resolvedPath = candidates.find((candidate) => {
        try {
          readFileSync(candidate);
          return true;
        } catch {
          return false;
        }
      });
      if (resolvedPath) return loadTsModule(resolvedPath);
    }
    return require(request);
  };
  new Function('exports', 'module', 'require', compiled.outputText)(module.exports, module, localRequire);
  return module.exports;
}

const batch = loadTsModule('../src/utils/clipBatchExport.ts');
const autosave = loadTsModule('../src/hooks/useProjectAutosave.ts');
const { validateClipDraftForExport } = loadTsModule('../src/utils/clipDrafts.ts');
const {
  INTERRUPTED_CLIP_EXPORT_ERROR,
  getClipBatchExportCandidates,
  getClipBatchProgressSummary,
  hasRecoverableClipExports,
  recoverInterruptedClipDraft,
  recoverInterruptedClipDrafts,
} = batch;

const words = [
  { word: 'This', start: 0, end: 0.4, confidence: 1 },
  { word: 'is', start: 0.4, end: 0.7, confidence: 1 },
  { word: 'the', start: 0.7, end: 1, confidence: 1 },
  { word: 'hook', start: 1, end: 1.6, confidence: 1 },
];

const draft = (id, status = 'draft', overrides = {}) => ({
  id,
  title: id,
  reason: 'Strong opening',
  startWordIndex: 0,
  endWordIndex: 3,
  startTime: 0,
  endTime: 1.6,
  status,
  platform: 'shorts',
  format: 'mp4',
  resolution: '1080p',
  aspectRatio: 'vertical',
  ...overrides,
});

const candidates = [
  draft('draft'),
  draft('packaged', 'packaged'),
  draft('failed', 'failed'),
  draft('suggested', 'suggested'),
  draft('exporting', 'exporting'),
  draft('exported', 'exported'),
  draft('invalid', 'draft', { title: '' }),
];
assert.deepEqual(
  getClipBatchExportCandidates(candidates, words, '/tmp/video.mp4').map((item) => item.id),
  ['draft', 'packaged', 'failed'],
);
assert.deepEqual(
  getClipBatchExportCandidates([candidates[2], candidates[0]], words, '/tmp/video.mp4').map((item) => item.id),
  ['failed', 'draft'],
);
assert.equal(hasRecoverableClipExports(candidates, words, '/tmp/video.mp4'), true);
assert.equal(validateClipDraftForExport(candidates[6], words, '/tmp/video.mp4').ready, false);

const recovered = recoverInterruptedClipDraft(draft('interrupted', 'exporting'));
assert.equal(recovered.status, 'failed');
assert.equal(recovered.lastError, INTERRUPTED_CLIP_EXPORT_ERROR);
assert.equal(recoverInterruptedClipDraft(draft('failed', 'failed')).status, 'failed');
assert.equal(recoverInterruptedClipDraft(draft('exported', 'exported')).status, 'exported');
assert.equal(recoverInterruptedClipDraft(draft('useful-error', 'exporting', { lastError: 'Backend stopped' })).lastError, 'Backend stopped');
assert.equal(recoverInterruptedClipDraft(draft('malformed-history', 'exporting', { exportPath: '/tmp/old.mp4', exportedAt: '2026-08-21T00:00:00.000Z' })).exportPath, '/tmp/old.mp4');
assert.deepEqual(recoverInterruptedClipDrafts([draft('one', 'exporting'), draft('two', 'failed')]).map((item) => item.status), ['failed', 'failed']);

const project = (clipDrafts) => ({
  app: 'ScriptCut',
  schema: 'scriptcut.project.v1',
  version: 1,
  videoPath: '/tmp/video.mp4',
  words,
  segments: [],
  deletedRanges: [],
  aiWorkspace: { clipDrafts },
  language: 'en',
  createdAt: '2026-08-21T00:00:00.000Z',
  modifiedAt: '2026-08-21T00:00:00.000Z',
});
const normalized = autosave.normalizeProjectFile(project([
  draft('loads-draft'),
  draft('loads-failed', 'failed', { lastError: 'Try again' }),
  draft('loads-exported', 'exported', { exportPath: '/tmp/clip.mp4', exportedAt: '2026-08-21T00:00:00.000Z' }),
  draft('loads-exporting', 'exporting'),
]));
assert.deepEqual(normalized.aiWorkspace?.clipDrafts?.map((item) => item.status), ['draft', 'failed', 'exported', 'failed']);
assert.equal(normalized.aiWorkspace?.clipDrafts?.[3]?.lastError, INTERRUPTED_CLIP_EXPORT_ERROR);
assert.equal(normalized.aiWorkspace?.clipDrafts?.[2]?.exportPath, '/tmp/clip.mp4');
assert.equal(autosave.normalizeProjectFile(project(undefined)).version, 1);
assert.equal(autosave.normalizeProjectFile(project([])).schema, 'scriptcut.project.v1');

assert.deepEqual(
  getClipBatchProgressSummary({ processed: 2, total: 5, exported: 1, failed: 1, stopping: false }),
  { processed: 2, total: 5, exported: 1, failed: 1, remaining: 3, stopping: false },
);
assert.deepEqual(
  getClipBatchProgressSummary({ processed: 2, total: 5, exported: 2, failed: 0, stopping: true }),
  { processed: 2, total: 5, exported: 2, failed: 0, remaining: 3, stopping: true },
);

const panelSource = sourceFor('../src/components/AIPanel.tsx');
const autosaveSource = sourceFor('../src/hooks/useProjectAutosave.ts');
const projectSource = sourceFor('../src/types/project.ts');
const manifestSource = panelSource.slice(panelSource.indexOf('async function writeClipBatchManifest'));

assert.match(panelSource, /getClipBatchExportCandidates\(clipDrafts, words, videoPath\)/);
assert.match(panelSource, /for \(let index = 0; index < exportableDrafts.length; index\+\+\)/);
assert.doesNotMatch(panelSource, /Promise\.all\([^)]*export/);
assert.match(panelSource, /failedCount/);
assert.match(panelSource, /handleExportClip\(draft, draft, true\)/);
assert.match(panelSource, /if \(stopBatchExportRef\.current\) break/);
assert.match(panelSource, /Stopping after current clip/);
assert.match(panelSource, /Retry export/);
assert.match(panelSource, /const exportRetryable = status === 'failed'/);
assert.match(panelSource, /fetch\(`\$\{backendUrl\}\/jobs\/\$\{job\.id\}\/retry`/);
assert.match(panelSource, /handleExportClip\(draft, draft, true\)/);
assert.match(panelSource, /outputPath/);
assert.match(panelSource, /manifest/);
assert.match(panelSource, /manifestWarning/);
assert.match(manifestSource, /schema: 'scriptcut\.clipBatchManifest\.v1'/);
assert.match(manifestSource, /remaining/);
assert.match(manifestSource, /stopped/);
assert.doesNotMatch(manifestSource, /status: 'failed'.*unattempted/i);
assert.doesNotMatch(projectSource, /batchExportProgress/);
assert.doesNotMatch(projectSource, /clipExportJobs/);
assert.match(projectSource, /version: 1/);
assert.match(autosaveSource, /recoverInterruptedClipDraft/);
assert.doesNotMatch(autosaveSource, /clipExportJobs/);
assert.doesNotMatch(autosaveSource, /backend job/i);
