/* eslint-disable no-regex-spaces */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(__dirname, '../src');
const readSource = (relativePath) => readFileSync(resolve(__dirname, relativePath), 'utf8');

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.(tsx?|jsx?)$/.test(entry.name) ? [path] : [];
  });
}

const allSource = sourceFiles(srcRoot).map((path) => readFileSync(path, 'utf8')).join('\n');
assert.doesNotMatch(allSource, /\balert\s*\(|window\.alert|\bconfirm\s*\(|window\.confirm|\bprompt\s*\(|window\.prompt/);

const app = readSource('../src/App.tsx');
const transcript = readSource('../src/components/TranscriptEditor.tsx');
const status = readSource('../src/components/TranscriptionStatus.tsx');
const waveform = readSource('../src/components/WaveformTimeline.tsx');
const ai = readSource('../src/components/AIPanel.tsx');
const dialog = readSource('../src/components/CreatorDialog.tsx');
const notice = readSource('../src/components/CreatorNotice.tsx');
const shortcuts = readSource('../src/hooks/useKeyboardShortcuts.ts');

const openFileBody = app.match(/const handleOpenFile = async \(intent: WorkflowIntent = 'full-video'\) => \{([\s\S]*?)\n  \};\n\n  const handleBrowserFileChange/)?.[1] || '';
const browserChangeBody = app.match(/const handleBrowserFileChange = async \(e: React\.ChangeEvent<HTMLInputElement>\) => \{([\s\S]*?)\n  \};\n\n  const handleBrowserDrop/)?.[1] || '';
assert.match(openFileBody, /if\s*\(path\)\s*\{[\s\S]*setEditorWorkflow\(intent\)/);
assert.doesNotMatch(openFileBody.split("if (IS_ELECTRON)")[0], /setEditorWorkflow\(/);
assert.match(browserChangeBody, /if\s*\(!file\)\s*return;[\s\S]*await uploadBrowserFile\(file, browserWorkflowIntent\)/);
assert.doesNotMatch(browserChangeBody.split('if (!file) return;')[0], /setEditorWorkflow\(/);
assert.match(app, /const data = \(await res\.json\(\)\)[\s\S]*resetMediaAIWorkspaceForNewMedia\(\)/);
assert.match(app, /Autosaved work found/);
assert.match(app, /Restore autosave/);
assert.match(app, /Start new transcription/);
assert.match(app, /setAutosaveRestoreRequest\(null\)/);

assert.match(notice, /role=\{serious \? 'alert' : 'status'\}/);
assert.match(notice, /aria-live=\{serious \? 'assertive' : 'polite'\}/);
assert.match(dialog, /role="dialog"/);
assert.match(dialog, /aria-modal="true"/);
assert.match(dialog, /aria-labelledby=\{titleId\}/);
assert.match(dialog, /event\.key === 'Escape'/);
assert.match(dialog, /event\.key !== 'Tab'/);
assert.match(dialog, /focusReturnTarget/);
assert.match(dialog, /focusIsOutside/);
assert.match(dialog, /event\.shiftKey \? last : first/);
assert.match(dialog, /previousFocusRef\.current\?\.isConnected/);
assert.match(shortcuts, /document\.querySelector\('\[role="dialog"\]\[aria-modal="true"\]'\)/);
assert.ok(shortcuts.indexOf("document.querySelector('[role=\"dialog\"][aria-modal=\"true\"]')") < shortcuts.indexOf('switch (true)'));

assert.match(transcript, /title="Rename speaker"/);
assert.match(transcript, /title="Delete speaker words"/);
assert.match(transcript, /Delete this speaker’s words\?/);
assert.match(transcript, /deleteSpeakerWords\(speakerFilter\)/);
for (const label of ['Previous result', 'Next result', 'Clear search', 'Include previous word', 'Remove first selected word', 'Remove last selected word', 'Include next word']) {
  assert.match(transcript, new RegExp(`aria-label="${label}"`));
}
assert.match(transcript, /aria-label="Search transcript"/);
assert.match(transcript, /aria-label="Filter transcript by speaker"/);
assert.match(transcript, /aria-live="polite"/);
assert.match(transcript, /title: 'Copied'/);
assert.match(transcript, /Selected transcript text copied to the clipboard/);
assert.match(transcript, /getCreatorErrorPresentation\('clipboard', err\)/);
assert.match(transcript, /Clipboard access is unavailable/);
assert.match(transcript, /searchMatches\.length === 0 \? '0 results'/);

assert.match(status, /aria-expanded=\{showOptions\}/);
assert.match(status, /aria-controls="transcription-options"/);
assert.match(status, /id="transcription-options"/);
assert.match(waveform, /Waveform unavailable/);
assert.match(waveform, /couldn’t draw the audio waveform/);
assert.match(waveform, /You can still edit with the transcript and video preview/);
assert.match(waveform, /aria-label=\{followPlayhead \? 'Stop following playhead' : 'Follow playhead'\}/);
assert.match(waveform, /aria-label="Zoom out"/);
assert.match(waveform, /aria-label="Zoom in"/);

assert.match(ai, /activeAIJob\.id.*\/jobs\/\$\{activeAIJob\.id\}\/retry|\/jobs\/\$\{activeAIJob\.id\}\/retry/);
assert.match(ai, /ai:clip-metadata/);
assert.match(ai, /appendDiscoveredClipDrafts/);
assert.match(ai, /setCreatorNotice/);
assert.match(ai, /setCreatorNotice\(null\);\s*const startRes/);
assert.match(ai, /setCreatorNotice\(null\);\s*setProcessing\(true, `Retrying/);
const generatePublishingCopyBody = ai.match(/const generatePublishingCopy = useCallback\(([\s\S]*?)\n  \);\n\n  const retryAIJob/)?.[1] || '';
assert.match(generatePublishingCopyBody, /getCreatorErrorPresentation\('ai-action', err\)/);
assert.doesNotMatch(generatePublishingCopyBody, /getCreatorErrorPresentation\('clip-action', err\)/);
assert.doesNotMatch(generatePublishingCopyBody, /lastError/);

assert.match(app, /const openRecentProject = async \(project: RecentProject\)/);
const recentProjectBody = app.match(/const openRecentProject = async \(project: RecentProject\) => \{([\s\S]*?)\n  \};\n\n  const applyWorkflowIntent/)?.[1] || '';
assert.match(recentProjectBody, /removeRecentProject\(project\.path\)/);
assert.match(recentProjectBody, /refreshRecentProjects\(\)/);
assert.match(recentProjectBody, /getCreatorErrorPresentation\('recent-project', err\)/);
assert.doesNotMatch(recentProjectBody, /setRecoveryError/);
assert.match(app, /const handleLoadProject = async \(\) => \{\s*if \(!IS_ELECTRON\) return;\s*setCreatorNotice\(null\)/);
assert.match(app, /const handleSaveProject = async \(\) => \{\s*setCreatorNotice\(null\)/);

function loadTsModule(relativePath) {
  const source = readSource(relativePath);
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const module = { exports: {} };
  new Function('exports', 'module', 'require', compiled.outputText)(module.exports, module, require);
  return module.exports;
}

const { getCreatorErrorPresentation } = loadTsModule('../src/utils/creatorErrors.ts');
const cases = [
  ['project-load', 'invalid project JSON', 'Project couldn’t open'],
  ['project-save', 'disk is full', 'Project couldn’t save'],
  ['media-upload', 'Upload failed: unsupported codec', 'Media couldn’t open'],
  ['ai-action', '401 invalid api key', 'AI needs configuration'],
  ['ai-action', 'ECONNREFUSED provider', 'AI provider couldn’t be reached'],
  ['ai-action', '429 rate limit', 'AI provider is busy'],
  ['ai-action', 'unexpected model failure', 'AI couldn’t finish'],
  ['ai-action', 'Action canceled by creator', 'Action canceled'],
  ['recent-project', 'ENOENT: unavailable project', 'Recent project couldn’t open'],
  ['setup', 'backend startup failed', 'ScriptCut couldn’t start its editing service'],
  ['setup', 'Setup checks failed: Service Unavailable', 'Setup checks couldn’t finish'],
];
for (const [context, raw, title] of cases) {
  const result = getCreatorErrorPresentation(context, raw);
  assert.equal(result.title, title);
  assert.equal(result.technicalDetails, raw);
  assert.notEqual(result.message, raw);
}
