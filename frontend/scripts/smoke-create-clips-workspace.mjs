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
const reviewSource = readSource('../src/components/ClipReviewWorkspace.tsx');
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
assert.match(reviewSource, /Preview each moment/);
assert.match(reviewSource, /Prepare approved clips/);
assert.match(reviewSource, /Find more moments/);
assert.match(reviewSource, /Skipped/);
assert.match(reviewSource, /Restore/);
assert.match(reviewSource, /Skip/);
assert.doesNotMatch(reviewSource, /Remove/);
assert.match(panelSource, /Export Ready Clips/);
assert.match(panelSource, /setClipStage\(discovery\.stage\)/);
assert.match(panelSource, /setClipStage\('prepare'\)/);
assert.match(panelSource, /Review \{readyDraftCount\} ready/);
assert.match(panelSource, /appendDiscoveredClipDrafts/);
assert.match(panelSource, /status: 'draft'/);
assert.match(panelSource, /['"]speaker-turn['"]/);
assert.match(panelSource, /source: 'ai-director'/);
assert.match(panelSource, /updateClipDraft\(id, \{ status: 'draft', lastError: undefined \}\)/);
assert.match(panelSource, /const pendingReviewItems = useMemo/);
assert.match(panelSource, /Review \$\{pendingReviewItems\.length\}/);
assert.match(panelSource, /removeMatchingClipSuggestions/);
assert.match(panelSource, /createClipDraft\(clip, 'ai', undefined, false\)/);
assert.match(panelSource, /requestPreviewRange\(previewRange\.start, previewRange\.end\)/);
assert.doesNotMatch(panelSource, /requestSeek\(clip\.startTime/);
assert.match(panelSource, /getClipPreviewRange\(clip\)/);
assert.match(panelSource, /isPlaying,\s*previewRangeEnd,/);
assert.match(panelSource, /const activeReviewPreviewKey =\s*isPlaying && previewRangeEnd !== null \? activeClipPreviewKey : null/);
assert.match(panelSource, /activePreviewKey=\{activeReviewPreviewKey\}/);
assert.doesNotMatch(panelSource, /activePreviewKey=\{activeClipPreviewKey\}/);
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
assert.match(projectTypeSource, /clipReviewDecisions\?: Record<string, ClipReviewDecision>/);
assert.match(projectTypeSource, /export type ClipReviewDecision = 'approved' \| 'skipped'/);
assert.match(projectSchemaSource, /"clipReviewDecisions":/);
assert.match(autosaveSource, /normalizeClipReviewDecisions\(workspace\.clipReviewDecisions\)/);
assert.match(autosaveSource, /clipReviewDecisions: aiState\.clipReviewDecisions/);
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
  getClipPreviewRange,
  getClipReviewKey,
  getPendingReviewItems,
  getSkippedReviewItems,
  getReviewCounts,
  getUnmatchedLegacyClipSuggestions,
  isClipDraftInStage,
  normalizeClipReviewDecisions,
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
assert.equal(getClipReviewKey({ startWordIndex: 0, endWordIndex: 4 }), 'clip-0-4');
assert.deepEqual(getClipPreviewRange(suggestion), { start: 0, end: 18 });
assert.equal(getClipPreviewRange({ startTime: 0, endTime: 0 }), null);
assert.equal(getClipPreviewRange({ startTime: Number.NaN, endTime: 18 }), null);
assert.equal(getClipPreviewRange({ startTime: 0, endTime: Number.POSITIVE_INFINITY }), null);

const fiveSuggestions = Array.from({ length: 5 }, (_, index) => ({
  ...suggestion,
  title: `Moment ${index + 1}`,
  startWordIndex: index * 5,
  endWordIndex: index * 5 + 4,
  startTime: index * 20,
  endTime: index * 20 + 18,
}));
const fiveSuggestedDrafts = fiveSuggestions.map((clip, index) => ({
  ...clip,
  id: `clip-${index}`,
  status: 'suggested',
  format: 'mp4',
  resolution: '1080p',
  aspectRatio: 'vertical',
}));
const decisions = {};
assert.equal(getPendingReviewItems(fiveSuggestedDrafts, fiveSuggestions, decisions).length, 5);
decisions[getClipReviewKey(fiveSuggestions[0])] = 'approved';
assert.equal(getPendingReviewItems(fiveSuggestedDrafts, fiveSuggestions, decisions).length, 4);
decisions[getClipReviewKey(fiveSuggestions[1])] = 'skipped';
assert.equal(getPendingReviewItems(fiveSuggestedDrafts, fiveSuggestions, decisions).length, 3);
assert.equal(getSkippedReviewItems(fiveSuggestedDrafts, fiveSuggestions, decisions).length, 1);
assert.deepEqual(getReviewCounts(fiveSuggestedDrafts, fiveSuggestions, decisions), { pending: 3, skipped: 1, approved: 1 });
delete decisions[getClipReviewKey(fiveSuggestions[1])];
assert.equal(getPendingReviewItems(fiveSuggestedDrafts, fiveSuggestions, decisions).length, 4);
assert.equal(getPendingReviewItems(fiveSuggestedDrafts, fiveSuggestions, { [getClipReviewKey(fiveSuggestions[1])]: 'skipped' }).length, 4);
assert.equal(fiveSuggestedDrafts[1].status, 'suggested');
assert.deepEqual(normalizeClipReviewDecisions(undefined), {});
assert.deepEqual(
  normalizeClipReviewDecisions({ good: 'approved', skipped: 'skipped', bad: 'rejected', empty: '' }),
  { good: 'approved', skipped: 'skipped' },
);
assert.equal(getPendingReviewItems([], [suggestion], {}).length, 1);
assert.equal(getPendingReviewItems([approvedDraft], [suggestion], {}).length, 0);
assert.equal(getPendingReviewItems([], [suggestion], { [getClipReviewKey(suggestion)]: 'skipped' }).length, 0);
assert.equal(getSkippedReviewItems([], [suggestion], { [getClipReviewKey(suggestion)]: 'skipped' }).length, 1);
assert.equal(isClipDraftInStage(matchingDraft, 'review'), true);
assert.equal(isClipDraftInStage(approvedDraft, 'prepare'), true);
assert.equal(isClipDraftInStage(exportedDraft, 'export'), true);
assert.equal(isClipDraftInStage(matchingDraft, 'export'), false);
assert.match(panelSource, /EXPORTABLE_DRAFT_STATUSES = new Set<ClipDraftStatus>\(\['draft', 'packaged', 'failed'\]\)/);
assert.match(panelSource, /updateClipDraft\(id, \{ status: 'draft', lastError: undefined \}\)/);
assert.match(transcriptSource, /Draft clip/);
assert.match(panelSource, /Export Ready Clips/);
assert.match(panelSource, /\/jobs\/ai\/clip-metadata/);
