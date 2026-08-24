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
const headerSource = readSource('../src/components/EditorTaskHeader.tsx');
const handleOpenFileBody = appSource.match(
  /const handleOpenFile = async \(intent: WorkflowIntent = 'full-video'\) => \{([\s\S]*?)\n[ ]{2}\};\n\n[ ]{2}const handleBrowserFileChange/,
)?.[1] || '';
const handleBrowserFileChangeBody = appSource.match(
  /const handleBrowserFileChange = async \(e: React\.ChangeEvent<HTMLInputElement>\) => \{([\s\S]*?)\n[ ]{2}\};\n\n[ ]{2}const handleBrowserDrop/,
)?.[1] || '';
const handleBrowserDropBody = appSource.match(
  /const handleBrowserDrop = async \(e: React\.DragEvent<HTMLDivElement>\) => \{([\s\S]*?)\n[ ]{2}\};\n\n[ ]{2}const uploadBrowserFile/,
)?.[1] || '';

assert.match(appSource, /useState<EditorWorkflow>\('full-video'\)/);
assert.match(appSource, /setEditorWorkflow\(intent\)/);
assert.match(appSource, /const restoreProject =/);
assert.match(appSource, /getProjectWorkflow\(data\.aiWorkspace\)/);
assert.doesNotMatch(handleOpenFileBody.split('if (IS_ELECTRON)')[0], /setEditorWorkflow\(/);
assert.match(
  handleOpenFileBody,
  /if \(path\) \{[\s\S]*?setEditorWorkflow\(intent\);\s*applyWorkflowIntent\(intent\);\s*const restored = await tryRestoreAutosave/,
);
assert.doesNotMatch(handleBrowserFileChangeBody.split('if (!file) return;')[0], /setEditorWorkflow\(/);
assert.match(handleBrowserFileChangeBody, /if \(!file\) return;\s*await uploadBrowserFile\(file, browserWorkflowIntent\)/);
assert.match(handleBrowserDropBody, /if \(!file\) return;\s*await uploadBrowserFile\(file, 'full-video'\)/);
assert.match(appSource, /<EditorTaskHeader presentation=\{taskPresentation\}/);
assert.match(appSource, /getEditorTaskPresentation\(/);
assert.match(appSource, /aria-controls="editor-side-panel"/);
assert.match(appSource, /aria-expanded=\{showMoreMenu\}/);
assert.match(appSource, /id="editor-side-panel"/);
assert.match(appSource, /role="region"/);
assert.match(appSource, /aria-label=\{sidePanelLabel\}/);
assert.match(headerSource, /role="status"/);
assert.match(headerSource, /aria-live="polite"/);
assert.match(headerSource, /min-w-0/);
assert.doesNotMatch(headerSource, /Step 1|Step 2|Step 3|Next|Back/);

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

const {
  getEditorTaskPresentation,
  getProjectWorkflow,
  getPostTranscriptionPanel,
} = loadTsModule('../src/utils/editorTask.ts');

const base = {
  isTranscribing: false,
  hasTranscriptionError: false,
  wordCount: 12,
  cutCount: 0,
  layerCount: 0,
  activePanel: null,
};

assert.equal(getPostTranscriptionPanel('full-video'), null);
assert.equal(getPostTranscriptionPanel('short'), 'ai');
assert.equal(getPostTranscriptionPanel('project'), null);

const transcribing = getEditorTaskPresentation({ ...base, workflow: 'full-video', isTranscribing: true });
assert.equal(transcribing.title, 'Preparing your transcript');

const failed = getEditorTaskPresentation({ ...base, workflow: 'full-video', hasTranscriptionError: true });
assert.equal(failed.title, 'Transcription needs attention');

const fullReady = getEditorTaskPresentation({ ...base, workflow: 'full-video' });
assert.equal(fullReady.workflowLabel, 'Edit a Video');
assert.equal(fullReady.title, 'Transcript ready');
assert.match(fullReady.description, /Edit the transcript/);

const fullEdited = getEditorTaskPresentation({ ...base, workflow: 'full-video', cutCount: 2, layerCount: 1 });
assert.equal(fullEdited.title, 'Review your changes');
assert.doesNotMatch(fullEdited.title, /Export complete|Ready to publish/);

const clipsReady = getEditorTaskPresentation({ ...base, workflow: 'short' });
assert.equal(clipsReady.workflowLabel, 'Create Clips');
assert.equal(clipsReady.title, 'Transcript ready');
assert.match(clipsReady.description, /AI tools/);
assert.doesNotMatch(clipsReady.description, /must|required/);
assert.notEqual(clipsReady.status, 'Optional');

const clipsEdited = getEditorTaskPresentation({ ...base, workflow: 'short', cutCount: 1 });
assert.equal(clipsEdited.title, 'Prepare your clips');

const projectReady = getEditorTaskPresentation({ ...base, workflow: 'project' });
assert.equal(projectReady.workflowLabel, 'Project');
assert.equal(projectReady.title, 'Project ready');

assert.equal(getEditorTaskPresentation({ ...base, workflow: 'full-video', activePanel: 'ai' }).title, 'AI tools');
assert.equal(getEditorTaskPresentation({ ...base, workflow: 'short', activePanel: 'ai' }).title, 'Create Clips');
assert.equal(getEditorTaskPresentation({ ...base, workflow: 'short', activePanel: 'ai' }).status, 'Ready to find');
assert.equal(
  getEditorTaskPresentation({ ...base, workflow: 'short', activePanel: 'ai' }).description,
  'Find, review, prepare, and export moments from your recording.',
);
assert.equal(getEditorTaskPresentation({ ...base, workflow: 'full-video', activePanel: 'export' }).title, 'Export');
assert.equal(getEditorTaskPresentation({ ...base, workflow: 'full-video', activePanel: 'settings' }).title, 'Settings');
assert.equal(getEditorTaskPresentation({ ...base, workflow: 'full-video', wordCount: 0 }).title, 'Waiting for transcript');

const clipSuggestion = { startWordIndex: 0, endWordIndex: 4 };
assert.equal(getProjectWorkflow({ clipSuggestions: [clipSuggestion] }), 'short');
assert.equal(getProjectWorkflow({ clipDrafts: [{ ...clipSuggestion, status: 'draft' }] }), 'short');
assert.equal(getProjectWorkflow({ clipReviewDecisions: { 'clip-0-4': 'approved' } }), 'project');
