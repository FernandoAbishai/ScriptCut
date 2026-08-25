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
const packageJson = JSON.parse(readSource('../package.json'));

assert.equal(packageJson.scripts['test:transcription-lifecycle'], 'node scripts/smoke-transcription-lifecycle.mjs');
assert.match(appSource, /transcriptionRunEpochRef/);
assert.match(appSource, /transcriptionRunRef/);
assert.match(appSource, /useEditorStore\.getState\(\)\.videoPath/);
assert.match(appSource, /isCurrentTranscriptionRunContext/);
assert.match(appSource, /const run = beginTranscriptionRun\(path, intent\)/);
assert.match(appSource, /const run = beginTranscriptionRun\(previousRun\.mediaPath, previousRun\.intent/);
assert.match(appSource, /const pollTranscriptionJob = async \(\s*jobId: string,\s*run:/);

const completeBody = appSource.match(/const completeTranscription = \([\s\S]*?\n\s*\};\n\n\s*const transcribeVideo/)?.[0] || '';
assert.match(completeBody, /if \(!isCurrentTranscriptionRun\(run\)\) return;/);
assert.match(completeBody, /setTranscription\(data\)/);
assert.match(completeBody, /setActivePanel\(getPostTranscriptionPanel\(run\.intent\)\)/);

const pollBody = appSource.match(/const pollTranscriptionJob = async \([\s\S]*?\n\s*\};\n\n\s*const togglePanel/)?.[0] || '';
assert.match(pollBody, /await new Promise\(\(resolve\) => window\.setTimeout\(resolve, 700\)\);[\s\S]*if \(!isCurrentTranscriptionRun\(run\)\) return null;/);
assert.match(pollBody, /const res = await fetch\([\s\S]*?if \(!isCurrentTranscriptionRun\(run\)\) return null;/);
assert.match(pollBody, /const job = \(await res\.json\(\)\)[\s\S]*if \(!isCurrentTranscriptionRun\(run\)\) return null;[\s\S]*setTranscriptionMessage/);
assert.match(pollBody, /setTranscriptionLogs\(job\.logs \|\| \[\]\)/);
assert.match(pollBody, /setTranscribing\(/);

const transcribeBody = appSource.match(/const transcribeVideo = async \([\s\S]*?\n\s*\};\n\n\s*const cancelTranscription/)?.[0] || '';
assert.match(transcribeBody, /setLastTranscriptionJobId\(jobId\)/);
assert.match(transcribeBody, /if \(!isCurrentTranscriptionRun\(run\)\) return;[\s\S]*setLastTranscriptionJobId/);
assert.match(transcribeBody, /catch \(err\) \{\s*if \(!isCurrentTranscriptionRun\(run\)\) return;/);
assert.match(transcribeBody, /finally \{\s*if \(isCurrentTranscriptionRun\(run\)\) \{[\s\S]*setTranscriptionMessage\(''\)[\s\S]*setTranscribing\(false\)/);

const retryBody = appSource.match(/const retryTranscription = async \(\) => \{([\s\S]*?)\n\s*\};\n\n\s*const startTranscriptionWithSettings/)?.[1] || '';
assert.match(retryBody, /const previousRun = transcriptionRunRef\.current/);
assert.match(retryBody, /const run = beginTranscriptionRun\(previousRun\.mediaPath, previousRun\.intent/);
assert.match(retryBody, /if \(!isCurrentTranscriptionRun\(run\)\) return;/g);
assert.match(retryBody, /finally \{\s*if \(isCurrentTranscriptionRun\(run\)\)/);

const cancelBody = appSource.match(/const cancelTranscription = async \(\) => \{([\s\S]*?)\n\s*\};\n\n\s*const retryTranscription/)?.[1] || '';
assert.match(cancelBody, /const run = transcriptionRunRef\.current/);
assert.match(cancelBody, /await fetch\([\s\S]*?if \(!isCurrentTranscriptionRun\(run\)\) return;/);
assert.match(cancelBody, /catch \(err\) \{\s*if \(!isCurrentTranscriptionRun\(run\)\) return;/);

const openFileBody = appSource.match(/const handleOpenFile = async \(intent: WorkflowIntent = 'full-video'\) => \{([\s\S]*?)\n\s*\};\n\n\s*const handleBrowserFileChange/)?.[1] || '';
assert.match(openFileBody, /const path = await window\.electronAPI!\.openFile\(\);/);
assert.match(openFileBody, /if \(path\) \{[\s\S]*resetMediaAIWorkspaceForNewMedia\(\)/);
assert.doesNotMatch(openFileBody, /if \(!path\)[\s\S]*invalidateTranscriptionRun/);

const uploadBody = appSource.match(/const uploadBrowserFile = async \(file: File, intent: WorkflowIntent\) => \{([\s\S]*?)\n\s*\};\n\n\s*const tryRestoreAutosave/)?.[1] || '';
assert.match(uploadBody, /if \(!res\.ok\) \{[\s\S]*throw new Error\([\s\S]*?\n\s*\}/);
assert.match(uploadBody, /const data = \(await res\.json\(\)\)[\s\S]*resetMediaAIWorkspaceForNewMedia\(\)/);
assert.ok(uploadBody.indexOf('resetMediaAIWorkspaceForNewMedia()') > uploadBody.indexOf('const data ='));
assert.match(appSource, /const restoreProject = \(data: ReturnType<typeof parseProjectFile>\) => \{\s*invalidateTranscriptionRun\(\);\s*loadProjectState\(data\)/);
assert.match(appSource, /const resetMediaAIWorkspaceForNewMedia = useCallback\(\(\) => \{\s*invalidateTranscriptionRun\(\);/);
assert.doesNotMatch(appSource, /clipWorkspaceEpoch/);

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

const { createTranscriptionRunContext, isCurrentTranscriptionRun } = loadTsModule(
  '../src/utils/transcriptionLifecycle.ts',
);

const runA = createTranscriptionRunContext(1, '/media/a.mov', 'short');
const runB = createTranscriptionRunContext(2, '/media/b.mov', 'full-video');
assert.equal(isCurrentTranscriptionRun(runA, 1, '/media/a.mov'), true);
assert.equal(isCurrentTranscriptionRun(runB, 2, '/media/b.mov'), true);
assert.equal(isCurrentTranscriptionRun(runA, 2, '/media/b.mov'), false);
assert.equal(isCurrentTranscriptionRun(runB, 2, '/media/a.mov'), false);

const applied = [];
const applyIfCurrent = (run, epoch, mediaPath, mutation) => {
  if (!isCurrentTranscriptionRun(run, epoch, mediaPath)) return;
  applied.push(mutation);
};

// 1-5, 13: stale result/poll UI/finally/error and active-panel writes are all gated.
applyIfCurrent(runA, 2, '/media/b.mov', 'A transcript');
applyIfCurrent(runA, 2, '/media/b.mov', 'A message');
applyIfCurrent(runA, 2, '/media/b.mov', 'A logs');
applyIfCurrent(runA, 2, '/media/b.mov', 'A progress');
applyIfCurrent(runA, 2, '/media/b.mov', 'A finally idle');
applyIfCurrent(runA, 2, '/media/b.mov', 'A error');
applyIfCurrent(runA, 2, '/media/b.mov', 'A Create Clips panel');
assert.deepEqual(applied, []);
applyIfCurrent(runB, 2, '/media/b.mov', 'B transcript');
applyIfCurrent(runB, 2, '/media/b.mov', 'B current UI');
assert.deepEqual(applied, ['B transcript', 'B current UI']);

// 6, 11, 12: a POST/job retry result is only usable by its fresh current run.
const retryRun = createTranscriptionRunContext(3, '/media/b.mov', 'full-video');
assert.equal(isCurrentTranscriptionRun(runA, 3, '/media/b.mov'), false);
assert.equal(isCurrentTranscriptionRun(retryRun, 3, '/media/b.mov'), true);

// 7-10: transition boundaries are source-guarded; the pure invariant covers their outcome.
assert.match(appSource, /if \(path\) \{[\s\S]*resetMediaAIWorkspaceForNewMedia\(\)/);
assert.match(appSource, /if \(!file\) return;\s*await uploadBrowserFile/);
assert.match(appSource, /const restoreProject =/);
