import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const __dirname = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(__dirname, '../src/utils/captionDesigner.ts');
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

const { getCaptionAnimationLabel, getCaptionPositionClass, getCaptionPresetLabel, getCaptionPreviewWords } = module.exports;

assert.equal(getCaptionPresetLabel('creator'), 'Creator');
assert.equal(getCaptionPresetLabel(undefined), 'Clean');
assert.deepEqual(getCaptionPreviewWords({ wordsPerLine: 3 }, 'one two three four'), ['one', 'two', 'three']);
assert.equal(getCaptionPositionClass('center'), 'items-center');
assert.equal(getCaptionAnimationLabel('karaoke'), 'Word timed');
