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
assert.match(appSource, /const resetClipWorkspaceForNewMedia = useCallback/);
assert.match(appSource, /useAIStore\.getState\(\)\.resetClipWorkspace\(\)/);
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

assert.match(aiStoreSource, /resetClipWorkspace: \(\) =>/);
assert.match(aiStoreSource, /resetClipWorkspaceState\(state\)/);
assert.match(aiStoreSource, /clipWorkspaceEpoch: state\.clipWorkspaceEpoch \+ 1/);
assert.match(aiStoreSource, /clipSuggestions: \[\]/);
assert.match(aiStoreSource, /clipDrafts: \[\]/);
assert.match(aiStoreSource, /clipReviewDecisions: \{\}/);
assert.match(aiStoreSource, /providers: \{/);

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

const { resetClipWorkspaceState } = loadTsModule('../src/utils/clipWorkspace.ts');
const { getProjectWorkflow } = loadTsModule('../src/utils/editorTask.ts');

const suggestion = {
  title: 'Opening hook',
  startWordIndex: 0,
  endWordIndex: 4,
  startTime: 0,
  endTime: 18,
  reason: 'Clear hook',
};
const providerState = {
  providers: { ollama: { provider: 'ollama', model: 'llama3' } },
  defaultProvider: 'ollama',
  customFillerWords: 'okay',
  clipSuggestions: [suggestion],
  clipDrafts: [{ ...suggestion, id: 'clip-1', status: 'draft' }],
  clipReviewDecisions: { 'clip-0-4': 'approved' },
};
const resetState = resetClipWorkspaceState(providerState);
assert.deepEqual(resetState.clipSuggestions, []);
assert.deepEqual(resetState.clipDrafts, []);
assert.deepEqual(resetState.clipReviewDecisions, {});
assert.equal(resetState.providers, providerState.providers);
assert.equal(resetState.defaultProvider, providerState.defaultProvider);
assert.equal(resetState.customFillerWords, providerState.customFillerWords);

assert.equal(getProjectWorkflow({ clipSuggestions: [suggestion] }), 'short');
assert.equal(getProjectWorkflow({ clipDrafts: [{ ...suggestion, status: 'draft' }] }), 'short');
assert.equal(getProjectWorkflow({ clipReviewDecisions: { 'clip-0-4': 'approved' } }), 'project');
assert.equal(getProjectWorkflow({}), 'project');
