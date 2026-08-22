import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const __dirname = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(__dirname, '../src/utils/clipPresentation.ts');
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
  ASS_PREVIEW_REFERENCE_HEIGHT,
  buildClipPresentationPreview,
  chunkClipCaptionWords,
  clampReframe,
  getActiveCaptionChunk,
  getActiveKaraokeWord,
  getCaptionPreviewGeometry,
  getClipFramePreviewStyle,
  getEffectiveCaptionAnimation,
  updateClipPresentationPreviewForDraft,
  getVisibleClipCaptionWords,
} = module.exports;

const captionStyle = {
  preset: 'creator',
  fontName: 'Georgia',
  fontSize: 58,
  fontColor: '#ffffff',
  backgroundColor: '#111827',
  position: 'bottom',
  bold: true,
  highlightColor: '#facc15',
  wordsPerLine: 2,
  animation: 'karaoke',
};

const words = [
  { word: 'one', start: 0, end: 0.4, confidence: 1 },
  { word: 'two', start: 0.4, end: 0.8, confidence: 1 },
  { word: 'three', start: 0.8, end: 1.2, confidence: 1 },
  { word: 'four', start: 1.2, end: 1.6, confidence: 1 },
  { word: 'five', start: 1.6, end: 2, confidence: 1 },
  { word: 'six', start: 2, end: 2.4, confidence: 1 },
];

assert.deepEqual(clampReframe({ x: -20, y: 140 }), { x: 0, y: 100 });
assert.deepEqual(clampReframe({ x: 'not-a-number', y: null }), { x: 50, y: 50 });
assert.deepEqual(getClipFramePreviewStyle('source', { x: 0, y: 100 }), {
  objectFit: 'contain',
  objectPosition: '50% 50%',
});
assert.deepEqual(getClipFramePreviewStyle('vertical', { x: 0, y: 50 }), {
  objectFit: 'cover',
  objectPosition: '0% 50%',
});
assert.equal(getClipFramePreviewStyle('vertical', { x: 50, y: 50 }).objectPosition, '50% 50%');
assert.equal(getClipFramePreviewStyle('vertical', { x: 100, y: 100 }).objectPosition, '100% 100%');
assert.equal(getClipFramePreviewStyle('square', { x: 33, y: 67 }).objectPosition, '33% 67%');

const defaults = {
  aspectRatio: 'vertical',
  reframe: { x: 50, y: 50 },
  captions: 'burn-in',
  captionStyle,
};
const draftPreview = buildClipPresentationPreview(
  'clip-1-4',
  {
    id: 'draft-1',
    startWordIndex: 1,
    endWordIndex: 4,
    aspectRatio: 'square',
    reframe: { x: 7, y: 93 },
    captions: 'sidecar',
    captionStyle: { ...captionStyle, position: 'top' },
  },
  defaults,
);
assert.equal(draftPreview.draftId, 'draft-1');
assert.equal(draftPreview.aspectRatio, 'square');
assert.deepEqual(draftPreview.reframe, { x: 7, y: 93 });
assert.equal(draftPreview.captions, 'sidecar');
assert.equal(draftPreview.captionStyle.position, 'top');

const suggestionPreview = buildClipPresentationPreview(
  'clip-0-3',
  { startWordIndex: 0, endWordIndex: 3 },
  defaults,
);
assert.equal(suggestionPreview.aspectRatio, 'vertical');
assert.deepEqual(suggestionPreview.reframe, { x: 50, y: 50 });
assert.equal(suggestionPreview.captions, 'burn-in');

const activeDraftUpdate = updateClipPresentationPreviewForDraft(draftPreview, {
  ...draftPreview,
  id: 'draft-1',
  aspectRatio: 'vertical',
  reframe: { x: 91, y: 12 },
  captions: 'none',
  captionStyle: { ...captionStyle, position: 'center' },
});
assert.equal(activeDraftUpdate.aspectRatio, 'vertical');
assert.deepEqual(activeDraftUpdate.reframe, { x: 91, y: 12 });
assert.equal(activeDraftUpdate.captions, 'none');
assert.equal(activeDraftUpdate.captionStyle.position, 'center');
const inactiveDraftUpdate = updateClipPresentationPreviewForDraft(activeDraftUpdate, {
  ...activeDraftUpdate,
  id: 'draft-2',
  aspectRatio: 'square',
  reframe: { x: 1, y: 2 },
});
assert.equal(inactiveDraftUpdate, activeDraftUpdate);

const visibleWords = getVisibleClipCaptionWords(
  words,
  { startWordIndex: 0, endWordIndex: 5 },
  [{ id: 'deleted', start: 0.4, end: 0.8, wordIndices: [1] }],
  [{ id: 'hidden', kind: 'caption-only', start: 1.2, end: 1.6, wordIndices: [3] }],
);
assert.deepEqual(visibleWords.map((word) => word.word), ['one', 'three', 'five', 'six']);
const chunks = chunkClipCaptionWords(visibleWords, captionStyle);
assert.deepEqual(chunks.map((chunk) => chunk.words.map((word) => word.word)), [['one', 'three'], ['five', 'six']]);
assert.equal(getActiveCaptionChunk(chunks, 0.9), chunks[0]);
assert.equal(getActiveCaptionChunk(chunks, 1.3), null);
assert.equal(getActiveCaptionChunk(chunks, 1.8), chunks[1]);
assert.equal(getActiveCaptionChunk(chunks, 3), null);
assert.equal(getActiveKaraokeWord(chunks[0], 0.9).word, 'three');
assert.equal(getActiveKaraokeWord(chunks[0], 3), null);

const scaledGeometry = getCaptionPreviewGeometry(captionStyle, 540);
assert.equal(ASS_PREVIEW_REFERENCE_HEIGHT, 1080);
assert.equal(scaledGeometry.fontSize, 29);
assert.equal(scaledGeometry.marginV, 40);
assert.equal(getCaptionPreviewGeometry({ ...captionStyle, position: 'top' }, 540).marginV, 30);
assert.equal(getCaptionPreviewGeometry({ ...captionStyle, position: 'center' }, 540).marginV, 40);
assert.equal(getEffectiveCaptionAnimation({ ...captionStyle, animation: undefined, preset: 'karaoke' }), 'karaoke');

const repoRoot = resolve(__dirname, '../..');
const editorStoreSource = readFileSync(resolve(repoRoot, 'frontend/src/store/editorStore.ts'), 'utf8');
const panelSource = readFileSync(resolve(repoRoot, 'frontend/src/components/AIPanel.tsx'), 'utf8');
const playerSource = readFileSync(resolve(repoRoot, 'frontend/src/components/VideoPlayer.tsx'), 'utf8');
const overlaySource = readFileSync(resolve(repoRoot, 'frontend/src/components/ClipPresentationOverlay.tsx'), 'utf8');
const schemaSource = readFileSync(resolve(repoRoot, 'shared/project-schema.json'), 'utf8');

assert.match(editorStoreSource, /clipPresentationPreview: ClipPresentationPreview \| null/);
assert.match(editorStoreSource, /setClipPresentationPreview: \(preview: ClipPresentationPreview\)/);
assert.match(editorStoreSource, /clearClipPresentationPreview: \(\) => set\(\{ clipPresentationPreview: null \}\)/);
assert.match(editorStoreSource, /clipPresentationPreview: null/);

const previewHandler = panelSource.slice(panelSource.indexOf('const handlePreviewClip'), panelSource.indexOf('const [exportingDraftId'));
assert.match(previewHandler, /setClipPresentationPreview/);
assert.match(previewHandler, /requestPreviewRange\(previewRange\.start, previewRange\.end\)/);
assert.doesNotMatch(previewHandler, /setExportOptions|setPreviewAspectRatio/);
assert.match(panelSource, /preview\.draftId !== draft\.id/);
assert.match(panelSource, /updateClipPresentationPreviewForDraft/);
assert.match(panelSource, /setClipPresentationPreview\(nextPreview\)/);

assert.match(playerSource, /aspect-\[9\/16\]/);
assert.match(playerSource, /aspect-square/);
assert.match(playerSource, /ClipPresentationOverlay/);
assert.match(playerSource, /getClipFramePreviewStyle/);
assert.match(overlaySource, /pointer-events-none/);
assert.match(overlaySource, /SRT sidecar/);
assert.match(overlaySource, /Export will include an SRT caption file instead/);
assert.doesNotMatch(schemaSource, /clipPresentationPreview/);
