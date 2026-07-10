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
  getClipTranscript,
  getClipDraftReadinessScore,
  buildClipExportCaptionWords,
  getClipExportSegments,
  getWordIndicesForClip,
  normalizeClipDraftRange,
  validateClipDraftForExport,
} = module.exports;

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
assert.equal(weakScore.label, 'Needs work');
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
