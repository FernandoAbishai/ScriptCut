import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const __dirname = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(__dirname, '../src/utils/hookFrames.ts');
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
  buildHookFrameCandidates,
  formatHookFrameBrief,
  getHookFrameText,
  getSelectedHookFrame,
  safeHookFrameFilename,
} = module.exports;

const draft = {
  id: 'clip_1',
  title: 'The impossible moment!',
  hook: 'You will not believe this',
  reason: 'Strong visual moment',
  startWordIndex: 0,
  endWordIndex: 8,
  startTime: 10,
  endTime: 40,
  status: 'packaged',
  platform: 'shorts',
  format: 'mp4',
  resolution: '1080p',
  aspectRatio: 'vertical',
  reframe: { x: 50, y: 45 },
  caption: 'Watch the full turn.',
};

assert.equal(getHookFrameText(draft), 'You will not believe this');
assert.equal(safeHookFrameFilename('Bad title!!!'), 'Bad_title');

const frames = buildHookFrameCandidates(draft);
assert.equal(frames.length, 4);
assert.equal(frames[0].time, 11.8);
assert.equal(frames[1].time, 16.6);
assert.equal(frames.every((frame) => frame.warnings.length === 0), true);

const selected = getSelectedHookFrame({ ...draft, hookFrameTime: 25.2 });
assert.equal(selected.label, 'Midpoint');
assert.match(formatHookFrameBrief(draft, selected), /Safe frame center: 50% \/ 45%/);

const warnings = buildHookFrameCandidates({ ...draft, hook: '', title: '', thumbnailText: '', aspectRatio: 'source' });
assert.equal(warnings[0].warnings.length, 2);
