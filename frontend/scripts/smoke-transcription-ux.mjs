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
const homeSource = readSource('../src/components/HomeScreen.tsx');
const optionsSource = readSource('../src/components/TranscriptionOptions.tsx');
const statusSource = readSource('../src/components/TranscriptionStatus.tsx');

assert.match(appSource, /useState<TranscriptionEngine>\('auto'\)/);
assert.match(appSource, /useState\(AUTOMATIC_TRANSCRIPTION_MODEL\)/);
assert.doesNotMatch(appSource, /setTranscriptionEngine\(status\.default_engine\)/);
assert.doesNotMatch(appSource, /setTranscriptionModel\(status\.default_model\)/);
assert.match(appSource, /engine: transcriptionEngine, model: transcriptionModel/);
assert.match(appSource, /\/jobs\/transcribe/);
assert.match(appSource, /\/jobs\/\$\{lastTranscriptionJobId\}\/retry/);
assert.match(appSource, /\/jobs\/\$\{lastTranscriptionJobId\}\/cancel/);
assert.match(appSource, /setTimeout\(resolve, 700\)/);
assert.match(appSource, /transcriptionIntentRef/);
assert.match(appSource, /startTranscriptionWithSettings/);
assert.match(appSource, /transcribeVideo\(lastTranscriptionPath, transcriptionIntentRef\.current/);
assert.match(appSource, /const completeTranscription =/);
assert.match(appSource, /completeTranscription\(data, intent\)/);
assert.match(appSource, /completeTranscription\(data, transcriptionIntentRef\.current\)/);

assert.match(homeSource, /Advanced transcription/);
assert.match(homeSource, /<TranscriptionOptions/);
assert.match(optionsSource, /getDefaultModelForEngine\(engine\)/);
assert.match(optionsSource, /disabled=\{engine !== 'auto' && engineAvailability === false\}/);
assert.match(statusSource, /Preparing your transcript/);
assert.match(statusSource, /Technical details/);
assert.match(statusSource, />\s*Cancel\s*</);
assert.match(statusSource, />\s*Try Again\s*</);
assert.match(statusSource, />\s*Transcription Options\s*</);
assert.match(statusSource, />\s*Start With These Settings\s*</);
assert.match(statusSource, /role="alert"/);
assert.match(statusSource, /const \[settingsChanged, setSettingsChanged\] = useState\(false\)/);
assert.match(statusSource, /setSettingsChanged\(false\)/);
assert.match(statusSource, /setSettingsChanged\(true\)/);
assert.match(statusSource, /setShowOptions\(true\)/);
assert.match(statusSource, /!settingsChanged && lastJobId && onRetry/);
assert.match(statusSource, /failureKind === 'engine-unavailable' && transcriptionEngine !== 'auto'/);
assert.match(statusSource, /RELEASE_LINKS\.installGuide/);
assert.match(statusSource, /Open Setup Guide/);
assert.match(statusSource, /target="_blank"/);
assert.match(statusSource, /rel="noreferrer"/);
assert.doesNotMatch(statusSource, /onClick=\{onUseAutomatic\}/);
const automaticHandler = statusSource.match(/const handleUseAutomatic = \(\) => \{([\s\S]*?)\n\s{2}\};/)?.[1] || '';
assert.match(automaticHandler, /onUseAutomatic\(\)/);
assert.match(automaticHandler, /setSettingsChanged\(true\)/);
assert.match(automaticHandler, /setShowOptions\(true\)/);
assert.doesNotMatch(automaticHandler, /onStartWithSettings|fetch\(/);

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

const models = loadTsModule('../src/utils/transcriptionModels.ts');
assert.equal(models.getDefaultModelForEngine('auto'), 'base');
assert.equal(models.getDefaultModelForEngine('parakeet'), 'nvidia/parakeet-tdt-0.6b-v3');
assert.equal(models.TRANSCRIPTION_MODELS.auto[0].value, 'base');
assert.ok(models.TRANSCRIPTION_MODELS.whisperx.some(({ value }) => value === 'large'));
assert.equal(models.isEngineAvailable('auto', null), true);
assert.equal(models.isEngineAvailable('parakeet', { engines: { parakeet: { available: false } } }), false);

const ux = loadTsModule('../src/utils/transcriptionUx.ts');
assert.equal(ux.classifyTranscriptionFailure('Transcription canceled'), 'canceled');
assert.equal(ux.classifyTranscriptionFailure('No requested transcription backend is installed'), 'no-engine');
assert.equal(ux.classifyTranscriptionFailure('WhisperX is not installed'), 'engine-unavailable');
assert.equal(ux.classifyTranscriptionFailure('Could not read transcription job: timeout'), 'backend');
assert.equal(ux.getTranscriptionFailureCopy('engine-unavailable').title, "That transcription method isn't available on this setup.");
assert.equal(ux.getTranscriptionFailureCopy('canceled').summary, 'No changes were made to your media.');
