import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const __dirname = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(__dirname, '../src/utils/playback.ts');
const source = readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
});
const module = { exports: {} };
const run = new Function('exports', 'module', 'require', compiled.outputText);
run(module.exports, module, require);

const {
  getPlaybackTimeState,
  getPlayableSeekTime,
  getPreviewDuration,
  previewToSourceTime,
  sourceToPreviewTime,
} = module.exports;

const deletedRanges = [
  { start: 5, end: 8 },
  { start: 14, end: 16 },
];

assert.equal(getPreviewDuration(20, deletedRanges, true), 15);
assert.equal(sourceToPreviewTime(10, 20, deletedRanges, true), 7);
assert.equal(previewToSourceTime(7, 20, deletedRanges, true), 10);

assert.equal(getPlayableSeekTime(6, deletedRanges, true, 'forward'), 8);
assert.equal(getPlayableSeekTime(6, deletedRanges, true, 'backward'), 5);

const state = getPlaybackTimeState(17, 20, deletedRanges, true);
assert.equal(state.sourceTime, 17);
assert.equal(state.previewTime, 12);
assert.equal(state.previewDuration, 15);
assert.equal(state.sourceDuration, 20);
assert.ok(Math.abs(state.progress - 0.8) < 0.0001);

const originalState = getPlaybackTimeState(17, 20, deletedRanges, false);
assert.equal(originalState.previewTime, 17);
assert.equal(originalState.previewDuration, 20);
