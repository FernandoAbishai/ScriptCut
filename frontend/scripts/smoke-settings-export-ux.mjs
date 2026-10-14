import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const __dirname = dirname(fileURLToPath(import.meta.url));
const readSource = (relativePath) => readFileSync(resolve(__dirname, relativePath), 'utf8');

const settingsSource = readSource('../src/components/SettingsPanel.tsx');
const exportSource = readSource('../src/components/ExportDialog.tsx');
const exportControllerSource = readSource('../src/features/export/useFullVideoExportController.ts');
const appSource = readSource('../src/App.tsx');
const releaseSource = readSource('../src/utils/releaseInfo.ts');
const editorStoreSource = readSource('../src/store/editorStore.ts');
const helperSource = readSource('../src/utils/settingsUx.ts');

assert.match(settingsSource, />Settings<\/h3>/);
assert.doesNotMatch(settingsSource, /AI Settings/);
assert.match(settingsSource, /const \[showAdvancedAI, setShowAdvancedAI\] = useState\(false\)/);
assert.match(settingsSource, /Configure AI/);
assert.match(settingsSource, /aria-controls="advanced-ai-configuration"/);
assert.match(settingsSource, /showAdvancedAI && <div id="advanced-ai-configuration"/);
assert.match(settingsSource, /Local AI/);
assert.match(`${settingsSource}\n${helperSource}`, /Cloud AI/);
assert.match(settingsSource, /AI actions stay on your configured local endpoint/);
assert.match(settingsSource, /Transcript text is sent to the selected cloud provider only when you run an AI action/);
for (const provider of ['Ollama', 'OpenAI', 'Claude', '9router']) {
  assert.match(settingsSource, new RegExp(provider));
}
for (const label of ['App &amp; Support', 'Source &amp; Legal', 'Source code', 'AGPL-3.0-or-later', 'Third-party notices', 'Trademark policy']) {
  assert.match(settingsSource, new RegExp(label));
}
assert.doesNotMatch(settingsSource, /Source code for this exact binary/);

assert.match(exportSource, />Export Video<\/h3>/);
assert.match(exportSource, /<legend[^>]*>Output<\/legend>/);
for (const label of ['Source', 'Shorts', 'TikTok/Reels', 'Podcast', 'Destination', 'No captions', 'On video', 'Separate SRT']) {
  assert.match(exportSource, new RegExp(label));
}
assert.match(exportSource, /Export Video/);
assert.match(exportSource, /const \[showAdvancedExport, setShowAdvancedExport\] = useState\(false\)/);
assert.match(exportSource, /Advanced export settings/);
assert.match(exportSource, /aria-controls="advanced-export-settings"/);
assert.match(exportSource, /showAdvancedExport && <div id="advanced-export-settings"/);
assert.match(exportSource, /const \[showExportChecks, setShowExportChecks\] = useState\(false\)/);
assert.match(exportSource, /aria-controls="export-checks"/);
for (const technicalControl of [
  'Creator Templates',
  'Shorts Batch',
  'Caption Review',
  'Podcast Clip',
  'Export Mode',
  'Fast',
  'Re-encode',
  'Resolution',
  '4K (Ultra HD)',
  'Format',
  'MOV (QuickTime)',
  'WebM (VP9)',
  'Reframe',
  'Enhance audio (Studio Sound)',
  'Remove background',
  'Caption Style',
]) {
  assert.match(exportSource, new RegExp(technicalControl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
for (const contract of ['getExportPreflight', 'startExport', 'getFriendlyExportError', 'applyExportCompletion']) {
  assert.match(exportSource, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
for (const contract of ['/jobs/export', 'pollExportJob', '/retry', '/cancel']) {
  assert.match(exportControllerSource, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
assert.match(appSource, /const fullVideoExportController = useFullVideoExportController\(\{ backendUrl, workspaceRevision \}\)/);
assert.match(appSource, /activePanel === 'export' && <ExportDialog controller=\{fullVideoExportController\} \/>/);
assert.ok(
  appSource.indexOf('useFullVideoExportController({ backendUrl, workspaceRevision })') < appSource.indexOf("activePanel === 'export'"),
  'full-video export controller must remain mounted above the conditional ExportDialog panel',
);
assert.match(exportControllerSource, /const activeRunRef = useRef<FullVideoExportRun \| null>\(null\)/);
assert.match(exportControllerSource, /Another full-video export is still running/);
assert.match(exportControllerSource, /Connection interrupted; checking export status[\s\S]*setExporting\(true, activeProgressRef\.current\)[\s\S]*continue/);
assert.match(exportControllerSource, /if \(!res\.ok\) \{[\s\S]*res\.status === 404[\s\S]*Export status unavailable; retrying[\s\S]*continue/);
assert.match(exportControllerSource, /Export status was unreadable; retrying[\s\S]*setExporting\(true, activeProgressRef\.current\)[\s\S]*continue/);
assert.match(exportControllerSource, /const mirroredIsExporting = useEditorStore\(\(state\) => state\.isExporting\)/);
assert.match(exportControllerSource, /const mirroredExportProgress = useEditorStore\(\(state\) => state\.exportProgress\)/);
assert.match(exportControllerSource, /if \(!mirroredIsExporting \|\| mirroredExportProgress !== activeProgressRef\.current\) \{\s*setExporting\(true, activeProgressRef\.current\);\s*\}/);
assert.match(exportControllerSource, /workspaceRevision: number/);
assert.match(exportControllerSource, /const currentWorkspaceRef = useRef\(\{ mediaPath: currentMediaPath, workspaceRevision \}\)/);
assert.match(exportControllerSource, /context\.workspaceRevision === currentWorkspaceRef\.current\.workspaceRevision/);
assert.match(exportControllerSource, /if \(!isCurrentWorkspace\(context\)\) return null;[\s\S]*const run = beginRun\(context\)/);
const cancelTransportBody = exportControllerSource.match(/const cancelExportJob = useCallback\(async \(\) => \{([\s\S]*?)\n\s*\}, \[/)?.[1] || '';
assert.match(cancelTransportBody, /job\.runId !== run\.id \|\| !isCurrentRun\(run\)/);
assert.doesNotMatch(cancelTransportBody, /setExporting\(false/);
const retryTransportBody = exportControllerSource.match(/const retryExportJob = useCallback\(async \(\) => \{([\s\S]*?)\n\s*\}, \[/)?.[1] || '';
assert.match(retryTransportBody, /\['failed', 'canceled'\]\.includes\(sourceJob\.status\)/);
assert.match(retryTransportBody, /!isCurrentWorkspace\(sourceJob\.context\)/);
assert.match(retryTransportBody, /const run = beginRun\(sourceJob\.context\)/);
assert.doesNotMatch(exportControllerSource, /getExportPreflight|localStorage|rememberExport|buildBackendFileUrl|setExportOptions/);
assert.doesNotMatch(exportSource, /\/jobs\/export|\/jobs\/\$\{[^}]+\}\/cancel|\/jobs\/\$\{[^}]+\}\/retry/);
assert.match(exportSource, /completion\.context\.preset/);
assert.match(exportSource, /completion\.context\.format/);
assert.match(exportSource, /!mountedRef\.current/);
assert.match(exportSource, /useEditorStore\.getState\(\)\.videoPath !== completion\.context\.mediaPath/);
assert.match(exportControllerSource, /setPendingCompletion\(\{ jobId, completion \}\)/);
assert.match(exportSource, /pendingCompletion\.completion\.context\.mediaPath !== videoPath/);
assert.match(exportSource, /pendingCompletion\.completion\.context\.workspaceRevision !== workspaceRevision/);
assert.match(exportSource, /workspaceRevision,\s*preset: exportOptions\.preset/);
assert.match(exportSource, /applyExportCompletion\(pendingCompletion\.completion\)/);
assert.match(exportSource, /acknowledgeCompletion\(pendingCompletion\.jobId\)/);
assert.match(editorStoreSource, /preset: 'source'/);
assert.match(editorStoreSource, /mode: 'fast'/);
assert.match(editorStoreSource, /aspectRatio: 'source'/);
assert.match(editorStoreSource, /captions: 'none'/);
assert.match(editorStoreSource, /enhanceAudio: false/);

for (const link of [
  "sourceCode: 'https://github.com/FernandoAbishai/ScriptCut'",
  "license: 'https://github.com/FernandoAbishai/ScriptCut/blob/main/LICENSE'",
  "licensing: 'https://github.com/FernandoAbishai/ScriptCut/blob/main/docs/LICENSING.md'",
  "thirdPartyNotices: 'https://github.com/FernandoAbishai/ScriptCut/blob/main/THIRD_PARTY_NOTICES.md'",
  "trademarks: 'https://github.com/FernandoAbishai/ScriptCut/blob/main/TRADEMARKS.md'",
  "commercialLicensing: 'https://github.com/FernandoAbishai/ScriptCut/blob/main/COMMERCIAL-LICENSING.md'",
]) {
  assert.match(releaseSource, new RegExp(link.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

const compiled = ts.transpileModule(helperSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});
const module = { exports: {} };
new Function('exports', 'module', 'require', compiled.outputText)(module.exports, module, require);

const { getAIModeLabel } = module.exports;
assert.equal(getAIModeLabel('ollama'), 'Local AI');
assert.equal(getAIModeLabel('openai'), 'Cloud AI');
assert.equal(getAIModeLabel('claude'), 'Cloud AI');
assert.equal(getAIModeLabel('9router', 'http://localhost:20128/v1'), 'Local AI');
assert.equal(getAIModeLabel('9router', 'http://127.0.0.1:20128/v1'), 'Local AI');
assert.equal(getAIModeLabel('9router', 'https://router.example.com/v1'), 'Cloud AI');
