import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const __dirname = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(__dirname, '../src/utils/clipDrafts.ts');
const source = readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
});
const module = { exports: {} };
const run = new Function('exports', 'module', 'require', compiled.outputText);
run(module.exports, module, require);

const {
  clipDraftPatchInvalidatesPreparation,
  getClipTimelineExportFingerprint,
  getClipDraftUserEditResult,
  getClipTranscript,
  getClipDraftReadinessScore,
  buildClipExportCaptionWords,
  getClipExportSegments,
  getWordIndicesForClip,
  invalidateClipDraftsForTimelineChange,
  normalizeClipDraftRange,
  prepareReadyClipDraftsForExport,
  validateClipDraftForExport,
} = module.exports;

assert.equal(clipDraftPatchInvalidatesPreparation({ title: 'Updated title' }), true);
assert.equal(clipDraftPatchInvalidatesPreparation({ captions: 'sidecar' }), true);
assert.equal(clipDraftPatchInvalidatesPreparation({ reframe: { x: 40, y: 50 } }), true);
assert.equal(clipDraftPatchInvalidatesPreparation({ hook: 'Publishing hook only' }), false);
assert.equal(clipDraftPatchInvalidatesPreparation({ exportDirectory: '/tmp/exports' }), false);

const packagedEdit = getClipDraftUserEditResult(
  { id: 'packaged', status: 'packaged', exportPath: '/tmp/old.mp4' },
  { title: 'Updated title' },
);
assert.equal(packagedEdit.invalidated, true);
assert.equal(packagedEdit.blocked, false);
assert.equal(packagedEdit.patch.status, 'draft');
assert.equal(packagedEdit.patch.exportPath, undefined);

const failedEdit = getClipDraftUserEditResult(
  { id: 'failed', status: 'failed', lastError: 'Old failure' },
  { resolution: '720p' },
);
assert.equal(failedEdit.invalidated, true);
assert.equal(failedEdit.patch.status, 'draft');
assert.equal(failedEdit.patch.lastError, undefined);

const exportedEdit = getClipDraftUserEditResult(
  { id: 'exported', status: 'exported', exportPath: '/tmp/old.mp4', srtPath: '/tmp/old.srt', exportedAt: '2026-09-07T00:00:00.000Z' },
  { captions: 'none' },
);
assert.equal(exportedEdit.invalidated, true);
assert.equal(exportedEdit.patch.status, 'draft');
assert.equal(exportedEdit.patch.exportPath, undefined);
assert.equal(exportedEdit.patch.srtPath, undefined);
assert.equal(exportedEdit.patch.exportedAt, undefined);

const publishingOnlyEdit = getClipDraftUserEditResult(
  { id: 'exported', status: 'exported', exportPath: '/tmp/clip.mp4' },
  { hook: 'New publishing hook' },
);
assert.equal(publishingOnlyEdit.invalidated, false);
assert.equal(publishingOnlyEdit.blocked, false);
assert.equal(publishingOnlyEdit.patch.hook, 'New publishing hook');

const exportingEdit = getClipDraftUserEditResult(
  { id: 'exporting', status: 'exporting' },
  { aspectRatio: 'square' },
);
assert.equal(exportingEdit.blocked, true);
assert.deepEqual(exportingEdit.patch, {});

const timelineInvalidated = invalidateClipDraftsForTimelineChange([
  { id: 'draft', status: 'draft' },
  { id: 'packaged', status: 'packaged', exportPath: '/tmp/prepared.mp4' },
  { id: 'failed', status: 'failed', lastError: 'Retry me' },
  { id: 'exported', status: 'exported', exportPath: '/tmp/done.mp4', srtPath: '/tmp/done.srt' },
  { id: 'exporting', status: 'exporting' },
]);
assert.deepEqual(timelineInvalidated.map((item) => item.status), ['draft', 'draft', 'draft', 'draft', 'exporting']);
assert.equal(timelineInvalidated[1].exportPath, undefined);
assert.equal(timelineInvalidated[2].lastError, undefined);
assert.equal(timelineInvalidated[3].srtPath, undefined);

const baseTimelineFingerprint = getClipTimelineExportFingerprint([], []);
assert.equal(
  getClipTimelineExportFingerprint([], [{ id: 'speaker', kind: 'speaker-label', start: 0, end: 1, wordIndices: [0] }]),
  baseTimelineFingerprint,
  'speaker labels do not affect exported clip bytes',
);
assert.notEqual(
  getClipTimelineExportFingerprint([], [{ id: 'mute', kind: 'mute', start: 0, end: 1, wordIndices: [0] }]),
  baseTimelineFingerprint,
  'mute edits must invalidate prepared clip output',
);

const words = [
  { word: 'This', start: 0, end: 0.4, confidence: 1 },
  { word: 'is', start: 0.4, end: 0.7, confidence: 1 },
  { word: 'the', start: 0.7, end: 1, confidence: 1 },
  { word: 'hook', start: 1, end: 1.6, confidence: 1 },
];

const draft = {
  id: 'clip_1',
  title: 'Hook',
  reason: 'Strong opening',
  startWordIndex: 0,
  endWordIndex: 3,
  startTime: 0,
  endTime: 1.6,
  status: 'draft',
  platform: 'shorts',
  format: 'mp4',
  resolution: '1080p',
  aspectRatio: 'vertical',
};

const trimmed = normalizeClipDraftRange(draft, { startTime: 0.65, endTime: 1.2 }, words);
assert.equal(trimmed.startWordIndex, 1);
assert.equal(trimmed.endWordIndex, 3);
assert.equal(getClipTranscript(words, trimmed), 'is the hook');

assert.deepEqual(getWordIndicesForClip(words, { startWordIndex: -4, endWordIndex: 99 }), [0, 1, 2, 3]);
assert.equal(validateClipDraftForExport({ ...draft, title: '' }, words, '/tmp/video.mp4').ready, false);
assert.equal(validateClipDraftForExport({ ...draft, status: 'suggested' }, words, '/tmp/video.mp4').ready, false);
assert.equal(validateClipDraftForExport(draft, words, '/tmp/video.mp4').ready, true);

const preparedLifecycle = prepareReadyClipDraftsForExport(
  [
    draft,
    { ...draft, id: 'invalid-draft', title: '' },
    { ...draft, id: 'already-packaged', status: 'packaged' },
    { ...draft, id: 'failed-draft', status: 'failed', lastError: 'Retry me' },
    { ...draft, id: 'exported-draft', status: 'exported', exportPath: '/tmp/done.mp4' },
  ],
  words,
  '/tmp/video.mp4',
);
assert.deepEqual(preparedLifecycle.map((item) => item.status), ['packaged', 'draft', 'packaged', 'failed', 'exported']);
assert.equal(preparedLifecycle[3].lastError, 'Retry me');
assert.equal(preparedLifecycle[4].exportPath, '/tmp/done.mp4');

const clipSegments = getClipExportSegments(
  { startTime: 0, endTime: 1.6 },
  [{ id: 'cut_1', start: 0.4, end: 1, wordIndices: [1, 2] }],
);
assert.deepEqual(clipSegments, [{ start: 0, end: 0.4 }, { start: 1, end: 1.6 }]);
assert.deepEqual(
  buildClipExportCaptionWords(words, draft, clipSegments),
  [
    { word: 'This', start: 0, end: 0.4, confidence: 1 },
    { word: 'hook', start: 0.4, end: 1, confidence: 1 },
  ],
);
assert.deepEqual(
  buildClipExportCaptionWords(words, draft, clipSegments, new Set([3])),
  [{ word: 'This', start: 0, end: 0.4, confidence: 1 }],
);

const weakScore = getClipDraftReadinessScore(draft, words, '/tmp/video.mp4');
assert.equal(weakScore.label, 'Review');
const strongScore = getClipDraftReadinessScore(
  {
    ...draft,
    endTime: 30,
    endWordIndex: 3,
    status: 'packaged',
    captions: 'burn-in',
    hook: 'The opening hook',
    caption: 'A social caption',
    hashtags: ['shorts'],
  },
  words,
  '/tmp/video.mp4',
);
assert.equal(strongScore.label, 'Ready');
