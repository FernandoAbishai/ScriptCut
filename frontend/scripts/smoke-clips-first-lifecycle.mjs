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

assert.match(appSource, /label=\{editorWorkflow === 'short' \? 'Export Video' : 'Export'\}/);
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
assert.match(panelSource, /const result = await pollAIJob<unknown>[\s\S]*if \(!isCurrentClipWorkspace\(\)\) return;/);
assert.match(panelSource, /const cancelAIJob = useCallback\([\s\S]*if \(!isCurrentClipWorkspace\(\)\) return;/);
assert.match(panelSource, /finally \{\s+if \(isCurrentClipWorkspace\(\)\) setProcessing\(false\);/);

const openFileBody = appSource.match(/const handleOpenFile = async \(intent: WorkflowIntent = 'full-video'\) => \{([\s\S]*?)\n\s*\};\s*const handleBrowserFileChange/)?.[1] || '';
const browserChangeBody = appSource.match(/const handleBrowserFileChange = async \(e: React\.ChangeEvent<HTMLInputElement>\) => \{([\s\S]*?)\n\s*\};\s*const handleBrowserDrop/)?.[1] || '';
assert.match(openFileBody, /const path = await window\.electronAPI!\.openFile\(\);[\s\S]*if \(path\) \{[\s\S]*resetMediaAIWorkspaceForNewMedia\(\)/);
assert.match(browserChangeBody, /e\.target\.value = '';[\s\S]*if \(!file\) return;/);
assert.match(appSource, /const restoreProject = \(data: ReturnType<typeof parseProjectFile>\) => \{[\s\S]*loadProjectState\(data\)/);
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
