import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const __dirname = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(__dirname, '../src/utils/transcriptSelection.ts');
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
  adjustWordSelectionBoundary,
  formatSelectionDuration,
  normalizeWordSelection,
  summarizeWordSelection,
} = module.exports;

const words = [
  { word: 'Build', start: 0, end: 0.3, confidence: 1 },
  { word: 'clips', start: 0.3, end: 0.8, confidence: 1 },
  { word: 'fast', start: 0.8, end: 1.4, confidence: 1 },
];

assert.deepEqual(normalizeWordSelection([2, 0, 2, 99], words), [0, 2]);
assert.equal(summarizeWordSelection([], words), null);

const summary = summarizeWordSelection([1, 2], words);
assert.equal(summary.startIndex, 1);
assert.equal(summary.endIndex, 2);
assert.equal(summary.text, 'clips fast');
assert.ok(Math.abs(summary.duration - 1.1) < 0.0001);
assert.equal(formatSelectionDuration(65.4), '1:05.4');
assert.deepEqual(adjustWordSelectionBoundary([1, 2], words, 'start', -1), [0, 1, 2]);
assert.deepEqual(adjustWordSelectionBoundary([1, 2], words, 'start', 1), [2]);
assert.deepEqual(adjustWordSelectionBoundary([1, 2], words, 'end', -1), [1]);
assert.deepEqual(adjustWordSelectionBoundary([1, 2], words, 'end', 1), [1, 2]);
