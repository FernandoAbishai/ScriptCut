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
  getCurrentClipBatchDraftForExport,
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
  draft('invalid-packaged', 'packaged', { title: '' }),
];
assert.deepEqual(
  getClipBatchExportCandidates(candidates, words, '/tmp/video.mp4').map((item) => item.id),
  ['packaged', 'failed'],
);
assert.deepEqual(
  getClipBatchExportCandidates([candidates[2], candidates[0]], words, '/tmp/video.mp4').map((item) => item.id),
  ['failed'],
);
assert.equal(hasRecoverableClipExports(candidates, words, '/tmp/video.mp4'), true);
assert.equal(validateClipDraftForExport(candidates[6], words, '/tmp/video.mp4').ready, false);
assert.equal(validateClipDraftForExport(candidates[7], words, '/tmp/video.mp4').ready, false);
assert.equal(
  getCurrentClipBatchDraftForExport(
    [draft('planned', 'draft')],
    'planned',
    words,
    '/tmp/video.mp4',
  ),
  null,
  'a planned batch item demoted back to draft must not be submitted from an old packaged snapshot',
);
const currentPrepared = draft('planned', 'packaged', { title: 'Current durable title' });
assert.equal(
  getCurrentClipBatchDraftForExport([currentPrepared], 'planned', words, '/tmp/video.mp4'),
  currentPrepared,
  'batch export must use the current durable prepared draft',
);

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
  draft('loads-exported', 'exported', {
    exportPath: '/tmp/clip.mp4',
    srtPath: '/tmp/clip.srt',
    exportWarnings: ['Captions were delivered as an SRT sidecar.', 42],
    fileCapability: 'runtime-video-authority',
    srtFileCapability: 'runtime-srt-authority',
    exportedAt: '2026-08-21T00:00:00.000Z',
  }),
  draft('loads-exporting', 'exporting'),
]));
assert.deepEqual(normalized.aiWorkspace?.clipDrafts?.map((item) => item.status), ['draft', 'failed', 'exported', 'failed']);
assert.equal(normalized.aiWorkspace?.clipDrafts?.[3]?.lastError, INTERRUPTED_CLIP_EXPORT_ERROR);
assert.equal(normalized.aiWorkspace?.clipDrafts?.[2]?.exportPath, '/tmp/clip.mp4');
assert.equal(normalized.aiWorkspace?.clipDrafts?.[2]?.srtPath, '/tmp/clip.srt');
assert.deepEqual(normalized.aiWorkspace?.clipDrafts?.[2]?.exportWarnings, ['Captions were delivered as an SRT sidecar.']);
assert.equal(normalized.aiWorkspace?.clipDrafts?.[2]?.fileCapability, undefined);
assert.equal(normalized.aiWorkspace?.clipDrafts?.[2]?.srtFileCapability, undefined);
const serialized = autosave.serializeProjectFile(normalized);
assert.doesNotMatch(serialized, /runtime-video-authority|runtime-srt-authority/);
const reopened = autosave.parseProjectFile(serialized);
assert.equal(reopened.aiWorkspace?.clipDrafts?.[2]?.srtPath, '/tmp/clip.srt');
assert.deepEqual(reopened.aiWorkspace?.clipDrafts?.[2]?.exportWarnings, ['Captions were delivered as an SRT sidecar.']);
const preparedProject = autosave.normalizeProjectFile(project([draft('loads-packaged', 'packaged')]));
assert.equal(preparedProject.aiWorkspace?.clipDrafts?.[0]?.status, 'packaged');
assert.equal(
  autosave.parseProjectFile(autosave.serializeProjectFile(preparedProject)).aiWorkspace?.clipDrafts?.[0]?.status,
  'packaged',
  'prepared clip lifecycle state must survive project v1 save/reopen',
);
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
const cardSource = sourceFor('../src/features/clips/ClipDraftCard.tsx');
const controlsSource = sourceFor('../src/features/clips/ClipPrepareExportControls.tsx');
const exportFilesSource = sourceFor('../src/features/clips/clipExportFiles.ts');
const autosaveSource = sourceFor('../src/hooks/useProjectAutosave.ts');
const projectSource = sourceFor('../src/types/project.ts');
const manifestSource = exportFilesSource.slice(exportFilesSource.indexOf('export function buildClipBatchManifest'));

assert.match(panelSource, /getClipBatchExportCandidates\(clipDrafts, words, videoPath\)/);
assert.match(panelSource, /for \(let index = 0; index < exportableDrafts.length; index\+\+\)/);
assert.doesNotMatch(panelSource, /Promise\.all\([^)]*export/);
assert.match(panelSource, /const exportBusy = isBatchExporting \|\| exportingDraftId !== null/);
assert.match(panelSource, /exportBusy=\{exportBusy\}/);
assert.match(controlsSource, /disabled=\{exportBusy \|\| exportableDraftCount === 0\}/);
assert.match(cardSource, /disabled=\{!canExport \|\| exportBusy \|\| isExporting \|\| exportActive\}/);
assert.match(cardSource, /disabled=\{!exportValidation\.ready \|\| exportBusy\}/);
assert.doesNotMatch(controlsSource, /useAIStore|useEditorStore|fetch\(|localStorage/, 'prepare/export controls must stay presentational');
assert.ok((panelSource.match(/if \(exportBusy\) return;/g) || []).length >= 3, 'export handlers have defensive busy guards');
assert.match(controlsSource, /onClick=\{onStopBatchExport\}/);
assert.match(panelSource, /for \(let index = 0; index < exportableDrafts.length; index\+\+\)[\s\S]*?await handleExportClip/);
assert.doesNotMatch(panelSource, /\/jobs\/export-batch|\/export\/v2/);
const cancelHandlerSource = panelSource.slice(panelSource.indexOf('const cancelDraftExport'), panelSource.indexOf('const retryDraftExport'));
assert.match(cancelHandlerSource, /\/cancel/);
assert.doesNotMatch(cancelHandlerSource, /status: 'failed'/, 'cancel request must not mark the draft terminal before polling confirms cancellation');
assert.doesNotMatch(cancelHandlerSource, /setExportingDraftId/, 'cancel request must keep exportBusy active until the export poll reaches a terminal state');
assert.match(panelSource, /failedCount/);
assert.match(panelSource, /handleExportClip\(draft, draft, true\)/);
assert.match(panelSource, /if \(stopBatchExportRef\.current\) break/);
assert.match(controlsSource, /Stopping after current clip/);
assert.match(cardSource, /Retry export/);
assert.match(cardSource, /const exportRetryable = status === 'failed'/);
assert.match(cardSource, /const exportActive =[\s\S]*?isExporting[\s\S]*?status === 'exporting'/);
assert.match(cardSource, /disabled=\{!exportJobCancelable\}/);
assert.match(panelSource, /import \{ isClipTimelineMutationBlocked, useEditorStore \} from '\.\.\/store\/editorStore';/);
assert.ok(
  (panelSource.match(/if \(isClipTimelineMutationBlocked\(\)\) return;/g) || []).length >= 7,
  'compound filler/edit-plan timeline actions must not update decisions while a clip export blocks timeline mutation',
);
assert.match(panelSource, /const currentDraft = useAIStore\.getState\(\)\.clipDrafts\.find/);
assert.match(panelSource, /clearClipExportAttempt\(currentDraft\.id\)/);
assert.doesNotMatch(panelSource, /\/jobs\/\$\{job\.id\}\/retry/, 'clip retry must not replay an old backend export target');
assert.match(panelSource, /handleExportClip\(draft, draft, true\)/);
assert.match(panelSource, /handleExportClip\(currentDraft, currentDraft, true\)/);
const handleExportClipSource = panelSource.slice(panelSource.indexOf('const handleExportClip'), panelSource.indexOf('const cancelDraftExport'));
assert.ok(
  handleExportClipSource.indexOf("status: 'exporting'") < handleExportClipSource.indexOf('await fetch(`${backendUrl}/jobs/export`'),
  'durable exporting claim must happen before the first export request await',
);
assert.match(panelSource, /getCurrentClipBatchDraftForExport\([\s\S]*?plannedDraft\.id/);
assert.match(panelSource, /pausedForDraftChange = true/);
assert.match(panelSource, /Batch paused because a planned clip changed/);
assert.match(panelSource, /outputPath/);
assert.match(panelSource, /srtPath: output\.srtPath/);
assert.match(panelSource, /exportWarnings: output\.warnings/);
assert.match(panelSource, /manifest/);
assert.match(panelSource, /manifestWarning/);
assert.match(panelSource, /writeManifest: window\.electronAPI\?\.writeClipManifest/);
assert.match(manifestSource, /schema: 'scriptcut\.clipBatchManifest\.v1'/);
assert.match(manifestSource, /remaining/);
assert.match(manifestSource, /stopped/);
assert.doesNotMatch(manifestSource, /status: 'failed'.*unattempted/i);
assert.doesNotMatch(projectSource, /batchExportProgress/);
assert.doesNotMatch(projectSource, /clipExportJobs/);
assert.match(projectSource, /srtPath\?: string/);
assert.match(projectSource, /exportWarnings\?: string\[\]/);
assert.doesNotMatch(projectSource, /fileCapability|srtFileCapability/, 'runtime file capabilities must not become durable project state');
assert.match(cardSource, /exportResult\?\.srtPath \|\| draft\.srtPath/);
assert.match(cardSource, /exportResult\?\.warnings \|\| draft\.exportWarnings \|\| \[\]/);
assert.match(projectSource, /version: 1/);
assert.match(autosaveSource, /recoverInterruptedClipDraft/);
assert.doesNotMatch(autosaveSource, /clipExportJobs/);
assert.doesNotMatch(autosaveSource, /backend job/i);
