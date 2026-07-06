import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const __dirname = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(__dirname, '../src/utils/speakerStats.ts');
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

const { formatSpeakerDuration, getSpeakerStats } = module.exports;

const stats = getSpeakerStats([
  { word: 'hi', start: 0, end: 0.5, confidence: 1, speaker: 'A' },
  { word: 'there', start: 0.5, end: 1, confidence: 1, speaker: 'B' },
  { word: 'again', start: 1, end: 1.75, confidence: 1, speaker: 'A' },
]);

assert.equal(stats.length, 2);
assert.equal(stats[0].speaker, 'A');
assert.equal(stats[0].wordCount, 2);
assert.deepEqual(stats[0].wordIndices, [0, 2]);
assert.equal(stats[0].duration, 1.25);
assert.equal(formatSpeakerDuration(65), '1:05');
