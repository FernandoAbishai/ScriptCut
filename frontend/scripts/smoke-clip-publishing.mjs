import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const __dirname = dirname(fileURLToPath(import.meta.url));
const readSource = (relativePath) => readFileSync(resolve(__dirname, relativePath), 'utf8');

function loadTsModule(relativePath) {
  const source = readSource(relativePath);
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const module = { exports: {} };
  new Function('exports', 'module', 'require', compiled.outputText)(module.exports, module, require);
  return module.exports;
}

const panelSource = readSource('../src/components/AIPanel.tsx');
const autosaveSource = readSource('../src/hooks/useProjectAutosave.ts');
const projectTypeSource = readSource('../src/types/project.ts');
const projectSchemaSource = readSource('../../shared/project-schema.json');
const { normalizeClipPublishingCopy, normalizeTitleSuggestions, mergeGeneratedPublishingCopy, getPublishingCopyState } = loadTsModule('../src/utils/clipPublishing.ts');
const { getClipDraftReadinessScore, validateClipDraftForExport } = loadTsModule('../src/utils/clipDrafts.ts');

const baseDraft = {
  id: 'clip_1',
  title: 'Creator title',
  reason: 'Strong opening',
  startWordIndex: 0,
  endWordIndex: 3,
  startTime: 0,
  endTime: 30,
  status: 'draft',
  platform: 'shorts',
  format: 'mp4',
  resolution: '1080p',
  aspectRatio: 'vertical',
  captions: 'burn-in',
};
const words = Array.from({ length: 4 }, (_, index) => ({
  word: `word-${index}`,
  start: index * 8,
  end: index * 8 + 1,
  confidence: 1,
}));

assert.deepEqual(
  normalizeClipPublishingCopy({
    hook: ' Hook ',
    titles: [' One ', 'one', 'Two', 'Three', 'Four'],
    description: ' Description ',
    caption: ' Caption ',
    hashtags: ['#AI', ' ai ', '#Video'],
  }),
  {
    hook: 'Hook',
    titles: ['One', 'Two', 'Three'],
    description: 'Description',
    caption: 'Caption',
    hashtags: ['AI', 'Video'],
  },
);
assert.equal(normalizeClipPublishingCopy({ hook: ' ', titles: [] }), null);
assert.equal(normalizeClipPublishingCopy([]), null);
assert.deepEqual(normalizeTitleSuggestions([' One ', 'one', 2, '', 'Two', 'Three', 'Four']), ['One', 'Two', 'Three']);
assert.equal(normalizeTitleSuggestions({}), undefined);

const generated = {
  hook: 'Generated hook',
  titles: ['Suggested one', 'Suggested two'],
  description: 'Generated description',
  caption: 'Generated caption',
  hashtags: ['#one', '#two'],
};
const patch = mergeGeneratedPublishingCopy(baseDraft, generated);
assert.deepEqual(patch, {
  hook: 'Generated hook',
  description: 'Generated description',
  caption: 'Generated caption',
  hashtags: ['one', 'two'],
  titleSuggestions: ['Suggested one', 'Suggested two'],
});
assert.equal(patch.title, undefined);
assert.equal(patch.status, undefined);
assert.equal(patch.lastError, undefined);

const creatorEdited = {
  ...baseDraft,
  hook: 'Creator hook',
  description: 'Creator description',
  caption: 'Creator caption',
  hashtags: ['creator'],
};
assert.deepEqual(
  mergeGeneratedPublishingCopy(creatorEdited, generated),
  { titleSuggestions: ['Suggested one', 'Suggested two'] },
);
assert.equal(mergeGeneratedPublishingCopy(baseDraft, { description: 'Useful partial copy' }).description, 'Useful partial copy');
assert.equal(mergeGeneratedPublishingCopy(baseDraft, { description: ' ' }), null);

const partialState = getPublishingCopyState({ ...baseDraft, hook: 'Hook', hashtags: ['tag'] });
assert.equal(partialState.ready, false);
assert.deepEqual(partialState.presentFields, ['title', 'hook', 'hashtags']);
assert.deepEqual(partialState.missingFields, ['description', 'caption']);
assert.equal(getPublishingCopyState({ ...baseDraft, hook: 'Hook', description: 'Description', caption: 'Caption', hashtags: ['tag'] }).ready, true);

const exportReadyWithoutCopy = { ...baseDraft, source: 'transcript-selection' };
assert.equal(validateClipDraftForExport(exportReadyWithoutCopy, words, '/tmp/video.mp4').ready, true);
assert.equal(getClipDraftReadinessScore(exportReadyWithoutCopy, words, '/tmp/video.mp4').score, 100);
assert.equal(
  getClipDraftReadinessScore({ ...exportReadyWithoutCopy, status: 'packaged', hook: 'Hook', caption: 'Caption', hashtags: ['tag'] }, words, '/tmp/video.mp4').score,
  100,
);
assert.equal(validateClipDraftForExport({ ...exportReadyWithoutCopy, status: 'packaged' }, words, '/tmp/video.mp4').ready, true);
assert.equal(mergeGeneratedPublishingCopy(exportReadyWithoutCopy, { hook: ' ' }), null);

assert.match(panelSource, /Generate publishing copy/);
assert.match(panelSource, /Refresh publishing copy/);
assert.match(panelSource, /Copy ready/);
assert.match(panelSource, /onChange\(\{ title: suggestion \}\)/);
assert.match(panelSource, /mergeGeneratedPublishingCopy\(draft, data\)/);
assert.match(panelSource, /mergeGeneratedPublishingCopy\(draft, metadata\)/);
assert.doesNotMatch(panelSource, /\bPackage\b|\bPackaged\b/);
const generationBody = panelSource.match(/const generatePublishingCopy = useCallback\(([\s\S]*?)\n\s{2}\);\n\s{2}\n\s{2}const retryAIJob/)?.[1] || '';
assert.doesNotMatch(generationBody, /lastError/);
assert.match(autosaveSource, /titleSuggestions: normalizeTitleSuggestions\(draft\.titleSuggestions\)/);
assert.match(projectTypeSource, /titleSuggestions\?: string\[\]/);
assert.match(projectSchemaSource, /"titleSuggestions": \{ "type": "array"/);
assert.doesNotMatch(projectSchemaSource, /required": \[[^\]]*titleSuggestions/);
assert.match(autosaveSource, /PROJECT_SCHEMA = 'scriptcut\.project\.v1'/);
