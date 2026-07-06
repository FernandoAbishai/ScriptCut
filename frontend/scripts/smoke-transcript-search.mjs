import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const __dirname = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(__dirname, '../src/utils/transcriptSearch.ts');
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

const { findTranscriptMatches } = module.exports;

const words = [
  { word: 'Make', start: 0, end: 0.3, confidence: 1 },
  { word: 'this', start: 0.3, end: 0.6, confidence: 1 },
  { word: 'a', start: 0.6, end: 0.8, confidence: 1 },
  { word: 'Short', start: 0.8, end: 1.2, confidence: 1 },
  { word: 'short-form', start: 1.2, end: 1.8, confidence: 1 },
];

assert.deepEqual(findTranscriptMatches(words, 'short').map((match) => match.startIndex), [3, 4]);
assert.deepEqual(findTranscriptMatches(words, 'this a short').map((match) => [match.startIndex, match.endIndex]), [[1, 3]]);
assert.deepEqual(findTranscriptMatches(words, 'missing'), []);
