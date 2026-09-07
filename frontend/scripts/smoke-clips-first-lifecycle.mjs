import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const __dirname = dirname(fileURLToPath(import.meta.url));
const readSource = (relativePath) => readFileSync(resolve(__dirname, relativePath), 'utf8');

const appSource = readSource('../src/App.tsx');
const panelSource = readSource('../src/components/AIPanel.tsx');
const aiStoreSource = readSource('../src/store/aiStore.ts');
const aiJobControllerSource = readSource('../src/features/ai/useAIJobController.ts');

assert.match(appSource, /const currentWorkflowIntent: WorkflowIntent = editorWorkflow === 'short' \? 'short' : 'full-video'/);
assert.match(appSource, /onClick=\{\(\) => void handleOpenFile\(currentWorkflowIntent\)\}/);
assert.match(appSource, /label=\{editorWorkflow === 'short' \? 'Export Full Video' : 'Export'\}/);
assert.match(appSource, /dataAction="full-video-export"/);
assert.match(appSource, /const resetMediaAIWorkspaceForNewMedia = useCallback/);
assert.match(appSource, /useAIStore\.getState\(\)\.resetMediaAIWorkspace\(\)/);
assert.match(appSource, /clearClipPresentationPreview\(\)/);
assert.match(appSource, /setSelectedWordIndices\(\[\]\)/);
assert.match(appSource, /<AIPanel key=\{workspaceRevision\}/);
assert.match(appSource, /restoreProject\(data\)/);
assert.match(appSource, /getProjectWorkflow\(data\.aiWorkspace\)/);

assert.match(panelSource, /label="Create Clips"/);
assert.match(panelSource, /More AI tools/);
assert.match(panelSource, /mode === 'clips' \? \(/);
assert.match(panelSource, /const secondaryToolsVisible/);
assert.match(panelSource, /getInitialClipWorkspaceStage\(clipDrafts, clipSuggestions\)/);

assert.match(aiStoreSource, /resetMediaAIWorkspace: \(\) =>/);
assert.match(aiStoreSource, /resetMediaAIWorkspaceState\(state\)/);
assert.match(aiStoreSource, /restoreMediaAIWorkspaceState\(state, workspace\)/);
assert.match(aiStoreSource, /clipWorkspaceEpoch: state\.clipWorkspaceEpoch \+ 1/);
assert.match(aiStoreSource, /fillerResult: null/);
assert.match(aiStoreSource, /fillerDecisions: \{\}/);
assert.match(aiStoreSource, /editPlanInstruction: ''/);
assert.match(aiStoreSource, /editPlanResult: null/);
assert.match(aiStoreSource, /editPlanDecisions: \{\}/);
assert.match(aiStoreSource, /clipSuggestions: \[\]/);
assert.match(aiStoreSource, /clipDrafts: \[\]/);
assert.match(aiStoreSource, /clipReviewDecisions: \{\}/);
assert.match(aiStoreSource, /providers: \{/);
assert.match(panelSource, /if \(!isCurrentClipWorkspace\(\)\) return;\s+setEditPlanResult\(data\);/);
assert.match(panelSource, /if \(!isCurrentClipWorkspace\(\)\) return;\s+setFillerResult\(data\);/);
assert.match(panelSource, /useAIJobController\(\{ backendUrl \}\)/);
assert.doesNotMatch(panelSource, /activeAIJobRunRef|const pollAIJob|const beginAIJobRun|const finishAIJobRun|const isCurrentAIJobRun/);
assert.match(aiJobControllerSource, /type AIJobRunContext = \{[\s\S]*workspaceEpoch: number/);
assert.match(aiJobControllerSource, /const activeAIJobRunRef = useRef<AIJobRunContext \| null>\(null\)/);
assert.match(aiJobControllerSource, /Another AI action is still running/);
assert.match(aiJobControllerSource, /const isCurrentAIJobRun = useCallback/);
assert.match(aiJobControllerSource, /let jobRes: Response;[\s\S]*jobRes = await fetch\(`\$\{backendUrl\}\/jobs\/\$\{jobId\}`\)[\s\S]*Connection interrupted; checking AI job status[\s\S]*continue;/);
assert.match(aiJobControllerSource, /if \(!jobRes\.ok\) \{[\s\S]*jobRes\.status === 404[\s\S]*AI job status unavailable; retrying[\s\S]*continue;/);
assert.match(aiJobControllerSource, /let job: AIJob<T>;[\s\S]*job = \(await jobRes\.json\(\)\) as AIJob<T>[\s\S]*AI job status was unreadable; retrying[\s\S]*continue;/);
assert.match(aiJobControllerSource, /setActiveAIJob\(\{ \.\.\.job, \.\.\.context, workspaceEpoch: run\.workspaceEpoch, runId: run\.id \}\)/);
assert.match(aiJobControllerSource, /workspaceEpoch: run\.workspaceEpoch/);
assert.match(aiJobControllerSource, /runId: run\.id/);
assert.match(aiJobControllerSource, /current && current\.workspaceEpoch !== clipWorkspaceEpoch \? null : current/);
assert.doesNotMatch(aiJobControllerSource, /defaultProvider|providers|setFillerResult|setEditPlanResult|applyClipDiscoveryResult|mergeGeneratedPublishingCopy|setCreatorNotice|getCreatorErrorPresentation/);
const cancelAIJobBody = aiJobControllerSource.match(/const cancelAIJob = useCallback\(async \(\) => \{([\s\S]*?)\n\s*\}, \[/)?.[1] || '';
assert.match(cancelAIJobBody, /const run = activeAIJobRunRef\.current/);
assert.match(cancelAIJobBody, /if \(job\.workspaceEpoch !== run\.workspaceEpoch \|\| job\.runId !== run\.id \|\| !isCurrentAIJobRun\(run\)\) return/);
assert.match(cancelAIJobBody, /await fetch\([\s\S]*if \(!isCurrentAIJobRun\(run\)\) return/);
assert.doesNotMatch(cancelAIJobBody, /setProcessing\(false/);
const retryTransportBody = aiJobControllerSource.match(/const retryAIJob = useCallback\(async \(\) => \{([\s\S]*?)\n\s*\}, \[/)?.[1] || '';
assert.match(retryTransportBody, /const sourceJob = activeAIJob/);
assert.match(retryTransportBody, /sourceJob\.workspaceEpoch !== useAIStore\.getState\(\)\.clipWorkspaceEpoch/);
assert.match(retryTransportBody, /const run = beginAIJobRun\(\)/);
assert.match(retryTransportBody, /pollAIJob<unknown>\(jobId, sourceJob\.label, context, run\)/);
assert.match(retryTransportBody, /if \(!isCurrentAIJobRun\(run\)\) return null/);
const retryDomainBody = panelSource.match(/const retryAIJob = useCallback\(async \(\) => \{([\s\S]*?)\n\s*\}, \[/)?.[1] || '';
assert.match(retryDomainBody, /const retryResult = await retryAIJobTransport\(\)/);
assert.match(retryDomainBody, /retriedJob\.workspaceEpoch !== useAIStore\.getState\(\)\.clipWorkspaceEpoch/);
assert.match(retryDomainBody, /retriedJob\.kind === 'ai:filler-removal'/);
assert.match(retryDomainBody, /applyClipDiscoveryResult\(result as ClipDiscoveryResult, 'suggested_clip_retry'\)/);
assert.match(retryDomainBody, /mergeGeneratedPublishingCopy\(currentDraft, metadata\)/);

const openFileBody = appSource.match(/const handleOpenFile = async \(intent: WorkflowIntent = 'full-video'\) => \{([\s\S]*?)\n\s*\};\s*const handleBrowserFileChange/)?.[1] || '';
const browserChangeBody = appSource.match(/const handleBrowserFileChange = async \(e: React\.ChangeEvent<HTMLInputElement>\) => \{([\s\S]*?)\n\s*\};\s*const handleBrowserDrop/)?.[1] || '';
assert.match(openFileBody, /const path = await window\.electronAPI!\.openFile\(\);[\s\S]*if \(path\) \{[\s\S]*resetMediaAIWorkspaceForNewMedia\(\)/);
assert.match(browserChangeBody, /e\.target\.value = '';[\s\S]*if \(!file\) return;/);
assert.match(appSource, /const restoreProject = async \(data: ReturnType<typeof parseProjectFile>\) => \{[\s\S]*loadProjectState\(data, videoUrl\)/);
assert.match(appSource, /useAIStore\.getState\(\)\.loadProjectAIState\(data\.aiWorkspace\)/);

function loadTsModule(relativePath) {
  const source = readSource(relativePath);
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  });
  const module = { exports: {} };
  new Function('exports', 'module', 'require', compiled.outputText)(module.exports, module, require);
  return module.exports;
}

const { resetMediaAIWorkspaceState, restoreMediaAIWorkspaceState } = loadTsModule('../src/utils/clipWorkspace.ts');
const { getProjectWorkflow } = loadTsModule('../src/utils/editorTask.ts');

const suggestion = {
  title: 'Opening hook',
  startWordIndex: 0,
  endWordIndex: 4,
  startTime: 0,
  endTime: 18,
  reason: 'Clear hook',
};
const fillerResult = {
  fillerWords: [{ index: 1, word: 'um', start: 1, end: 1.2, reason: 'Repeated filler' }],
};
const editPlanResult = {
  summary: 'Tighten the opening',
  suggestions: [{ id: 'edit-1', startWordIndex: 0, endWordIndex: 2, startTime: 0, endTime: 4, reason: 'Tighter hook' }],
};
const providerState = {
  providers: { ollama: { provider: 'ollama', model: 'llama3' } },
  defaultProvider: 'ollama',
  customFillerWords: 'okay',
  _keysHydrated: true,
  fillerResult,
  fillerDecisions: { 1: 'rejected' },
  editPlanInstruction: 'Tighten the opening',
  editPlanResult,
  editPlanDecisions: { 'edit-1': 'accepted' },
  clipSuggestions: [suggestion],
  clipDrafts: [{ ...suggestion, id: 'clip-1', status: 'draft' }],
  clipReviewDecisions: { 'clip-0-4': 'approved' },
  isProcessing: true,
  processingMessage: 'Finding clips...',
};
const resetState = resetMediaAIWorkspaceState(providerState);
assert.equal(resetState.fillerResult, null);
assert.deepEqual(resetState.fillerDecisions, {});
assert.equal(resetState.editPlanInstruction, '');
assert.equal(resetState.editPlanResult, null);
assert.deepEqual(resetState.editPlanDecisions, {});
assert.deepEqual(resetState.clipSuggestions, []);
assert.deepEqual(resetState.clipDrafts, []);
assert.deepEqual(resetState.clipReviewDecisions, {});
assert.equal(resetState.isProcessing, false);
assert.equal(resetState.processingMessage, '');
assert.equal(resetState.providers, providerState.providers);
assert.equal(resetState.defaultProvider, providerState.defaultProvider);
assert.equal(resetState.customFillerWords, providerState.customFillerWords);
assert.equal(resetState._keysHydrated, providerState._keysHydrated);

const projectWorkspace = {
  customFillerWords: 'project filler',
  fillerResult,
  fillerDecisions: { 1: 'accepted' },
  editPlanInstruction: 'Keep the strongest explanation',
  editPlanResult,
  editPlanDecisions: { 'edit-1': 'rejected' },
  clipSuggestions: [suggestion],
  clipDrafts: [{ ...suggestion, id: 'project-clip-1', status: 'draft' }],
  clipReviewDecisions: { 'clip-0-4': 'skipped' },
};
const restoredState = restoreMediaAIWorkspaceState(resetState, projectWorkspace);
assert.deepEqual(restoredState.fillerResult, projectWorkspace.fillerResult);
assert.deepEqual(restoredState.fillerDecisions, projectWorkspace.fillerDecisions);
assert.equal(restoredState.editPlanInstruction, projectWorkspace.editPlanInstruction);
assert.deepEqual(restoredState.editPlanResult, projectWorkspace.editPlanResult);
assert.deepEqual(restoredState.editPlanDecisions, projectWorkspace.editPlanDecisions);
assert.deepEqual(restoredState.clipSuggestions, projectWorkspace.clipSuggestions);
assert.deepEqual(restoredState.clipDrafts, projectWorkspace.clipDrafts);
assert.deepEqual(restoredState.clipReviewDecisions, projectWorkspace.clipReviewDecisions);
assert.equal(restoredState.customFillerWords, projectWorkspace.customFillerWords);
assert.equal(restoredState.providers, providerState.providers);
assert.equal(restoredState.defaultProvider, providerState.defaultProvider);
assert.equal(restoredState.isProcessing, false);
assert.equal(restoredState.processingMessage, '');

assert.equal(getProjectWorkflow({ clipSuggestions: [suggestion] }), 'short');
assert.equal(getProjectWorkflow({ clipDrafts: [{ ...suggestion, status: 'draft' }] }), 'short');
assert.equal(getProjectWorkflow({ clipReviewDecisions: { 'clip-0-4': 'approved' } }), 'project');
assert.equal(getProjectWorkflow({}), 'project');
