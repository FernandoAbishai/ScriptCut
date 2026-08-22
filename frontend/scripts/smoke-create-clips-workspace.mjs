import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const __dirname = dirname(fileURLToPath(import.meta.url));
const readSource = (relativePath) => readFileSync(resolve(__dirname, relativePath), 'utf8');

const panelSource = readSource('../src/components/AIPanel.tsx');
const appSource = readSource('../src/App.tsx');
const transcriptSource = readSource('../src/components/TranscriptEditor.tsx');
const workspaceSource = readSource('../src/utils/clipWorkspace.ts');
const autosaveSource = readSource('../src/hooks/useProjectAutosave.ts');
const clipDraftsSource = readSource('../src/utils/clipDrafts.ts');
const projectTypeSource = readSource('../src/types/project.ts');
const projectSchemaSource = readSource('../../shared/project-schema.json');

assert.match(panelSource, /export default function AIPanel\(\{ mode = 'general' \}/);
assert.match(panelSource, /getInitialClipWorkspaceStage\(clipDrafts, clipSuggestions\)/);
assert.match(panelSource, /Find moments with AI/);
assert.match(panelSource, />Find moments<\/h3>/);
assert.match(panelSource, /Choose moments yourself/);
assert.match(panelSource, /Review each suggested moment/);
assert.match(panelSource, /Preview, approve to create a draft, or remove it/);
assert.doesNotMatch(panelSource, /Preview, rename, approve/);
assert.match(panelSource, /Prepare approved clips/);
assert.match(panelSource, /Export Ready Clips/);
assert.match(panelSource, /setClipStage\(discovery\.stage\)/);
assert.match(panelSource, /setClipStage\('prepare'\)/);
assert.match(panelSource, /Review \{readyDraftCount\} ready/);
assert.match(panelSource, /appendDiscoveredClipDrafts/);
assert.match(panelSource, /status: 'draft'/);
assert.match(panelSource, /['"]speaker-turn['"]/);
assert.match(panelSource, /source: 'ai-director'/);
assert.match(panelSource, /updateClipDraft\(id, \{ status: 'draft', lastError: undefined \}\)/);
assert.match(panelSource, /const pendingReviewCount = useMemo/);
assert.match(panelSource, /Review \$\{pendingReviewCount\}/);
assert.match(panelSource, /removeMatchingClipSuggestions/);
assert.match(panelSource, /createClipDraft\(clip, 'ai', undefined, false\)/);
assert.doesNotMatch(panelSource, /clipQueueSummary\.suggested === 0/);
assert.match(transcriptSource, /source: 'transcript-selection'/);
assert.match(panelSource, /type ClipDiscoveryResult/);
assert.match(panelSource, /requestedCount\?: number/);
assert.match(panelSource, /returnedCount\?: number/);
assert.match(panelSource, /shortfall\?: number/);
assert.match(panelSource, /applyClipDiscoveryResult/);
assert.match(panelSource, /readClipDiscoveryResult/);
assert.match(workspaceSource, /stage: clips\.length > 0 \? 'review' : 'find'/);
assert.match(panelSource, /invalid or overlapping moments instead of filling the queue with weaker clips/);
assert.match(panelSource, /couldn\\'t find a reliable clip suggestion/);
assert.doesNotMatch(panelSource, /min_duration:\s*30/);
assert.doesNotMatch(panelSource, /max_duration:\s*90/);
assert.match(autosaveSource, /clip-\$\{clip\.startWordIndex\}-\$\{clip\.endWordIndex\}/);
assert.match(autosaveSource, /rank: Number\.isInteger\(clip\.rank\)/);
assert.match(clipDraftsSource, /duration >= 15 && duration <= 60/);
assert.match(clipDraftsSource, /Keep social clips between about 15 and 60 seconds/);
assert.match(projectTypeSource, /id\?: string/);
assert.match(projectTypeSource, /rank\?: number/);
assert.match(projectTypeSource, /duration\?: number/);
assert.match(projectSchemaSource, /"duration": \{ "type": "number", "minimum": 0 \}/);
assert.match(panelSource, /validateClipDraftForExport\(draft, words, videoPath\)/);
assert.match(panelSource, /EXPORTABLE_DRAFT_STATUSES\.has\(draft\.status \|\| 'draft'\)/);
assert.match(panelSource, /\/jobs\/ai\/clip-metadata/);
assert.doesNotMatch(panelSource, /Shorts Queue/);
assert.doesNotMatch(panelSource, /AI Suggestions/);
assert.doesNotMatch(panelSource, /handleExportSuggestedClip/);
assert.match(appSource, /label=\{editorWorkflow === 'short' \? 'Create Clips' : 'AI'\}/);
assert.match(appSource, /<AIPanel mode=\{editorWorkflow === 'short' \? 'clips' : 'general'\}/);

const compiled = ts.transpileModule(workspaceSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
});
const module = { exports: {} };
new Function('exports', 'module', 'require', compiled.outputText)(module.exports, module, require);

const {
  getInitialClipWorkspaceStage,
  getPendingReviewCount,
  getUnmatchedLegacyClipSuggestions,
  isClipDraftInStage,
  readClipDiscoveryResult,
  removeMatchingClipSuggestions,
} = module.exports;

const suggestion = {
  title: 'Strong opening',
  startWordIndex: 0,
  endWordIndex: 4,
  startTime: 0,
  endTime: 18,
  reason: 'Clear hook',
};
const matchingDraft = { ...suggestion, id: 'clip_1', status: 'suggested', format: 'mp4', resolution: '1080p', aspectRatio: 'vertical' };
const approvedDraft = { ...matchingDraft, id: 'clip_2', status: 'draft' };
const exportedDraft = { ...matchingDraft, id: 'clip_3', status: 'exported' };
const manualDraft = { ...matchingDraft, id: 'clip_4', status: 'draft', source: 'speaker-turn' };
const unmatchedSuggestion = { ...suggestion, startWordIndex: 5, endWordIndex: 9 };
const reviewSuggestionTwo = { ...suggestion, title: 'Second moment', startWordIndex: 10, endWordIndex: 14 };
const reviewSuggestionThree = { ...suggestion, title: 'Third moment', startWordIndex: 15, endWordIndex: 19 };
const secondSuggestedDraft = { ...reviewSuggestionTwo, id: 'clip_5', status: 'suggested' };

assert.equal(getInitialClipWorkspaceStage([], []), 'find');
const rankedDiscovery = readClipDiscoveryResult({
  clips: [
    { ...suggestion, id: 'clip-10-20', rank: 2 },
    { ...suggestion, id: 'clip-0-4', rank: 1 },
  ],
  requestedCount: 5,
});
assert.equal(rankedDiscovery.stage, 'review');
assert.equal(rankedDiscovery.requestedCount, 5);
assert.equal(rankedDiscovery.returnedCount, 2);
assert.equal(rankedDiscovery.shortfall, 3);
assert.deepEqual(rankedDiscovery.clips.map((clip) => clip.id), ['clip-10-20', 'clip-0-4']);
const emptyDiscovery = readClipDiscoveryResult({ clips: [], requestedCount: 5 });
assert.equal(emptyDiscovery.stage, 'find');
assert.equal(emptyDiscovery.returnedCount, 0);
assert.equal(emptyDiscovery.shortfall, 5);
assert.equal(getInitialClipWorkspaceStage([matchingDraft], []), 'review');
assert.equal(getInitialClipWorkspaceStage([approvedDraft], []), 'prepare');
assert.equal(getInitialClipWorkspaceStage([manualDraft], []), 'prepare');
assert.equal(getInitialClipWorkspaceStage([exportedDraft], []), 'export');
assert.equal(getInitialClipWorkspaceStage([approvedDraft], [suggestion]), 'prepare');
assert.deepEqual(
  getUnmatchedLegacyClipSuggestions([suggestion, unmatchedSuggestion], [matchingDraft]),
  [unmatchedSuggestion],
);
assert.deepEqual(
  removeMatchingClipSuggestions([suggestion, unmatchedSuggestion], matchingDraft),
  [unmatchedSuggestion],
);
assert.equal(getPendingReviewCount([matchingDraft], [suggestion]), 1);
assert.equal(getPendingReviewCount([], [suggestion, unmatchedSuggestion, reviewSuggestionTwo]), 3);
assert.equal(
  getPendingReviewCount([matchingDraft, secondSuggestedDraft], [suggestion, reviewSuggestionTwo, reviewSuggestionThree]),
  3,
);
assert.equal(getPendingReviewCount([approvedDraft], [suggestion, unmatchedSuggestion]), 1);
assert.equal(getPendingReviewCount([], [suggestion, unmatchedSuggestion]), 2);
assert.equal(isClipDraftInStage(matchingDraft, 'review'), true);
assert.equal(isClipDraftInStage(approvedDraft, 'prepare'), true);
assert.equal(isClipDraftInStage(exportedDraft, 'export'), true);
assert.equal(isClipDraftInStage(matchingDraft, 'export'), false);
