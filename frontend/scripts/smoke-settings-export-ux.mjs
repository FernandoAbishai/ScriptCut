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
for (const contract of [
  'getExportPreflight',
  'startExport',
  '/jobs/export',
  'pollExportJob',
  '/retry',
  '/cancel',
  'getFriendlyExportError',
]) {
  assert.match(exportSource, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
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
