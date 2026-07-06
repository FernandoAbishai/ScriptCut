import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const __dirname = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(__dirname, '../src/utils/socialPublishing.ts');
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

const { buildSocialCaption, buildSocialPublishingPack, normalizeSocialHashtags } = module.exports;

assert.deepEqual(normalizeSocialHashtags(['#AI', 'ai', 'Creator!'], 'shorts'), ['shorts', 'ai', 'creator']);
assert.equal(buildSocialCaption({ caption: '', description: 'Use this description', hook: 'Hook' }), 'Use this description');

const draft = {
  id: 'clip_1',
  title: 'A strong hook',
  reason: 'Strong moment',
  startWordIndex: 0,
  endWordIndex: 4,
  startTime: 0,
  endTime: 12,
  status: 'packaged',
  platform: 'shorts',
  format: 'mp4',
  resolution: '1080p',
  aspectRatio: 'vertical',
  caption: 'This is the clip caption',
  hashtags: ['podcast', 'story'],
};

const pack = buildSocialPublishingPack(draft);
assert.equal(pack.length, 3);
assert.equal(pack.every((item) => item.ready), true);
assert.equal(pack.find((item) => item.platform === 'youtube-shorts').hashtags[0], 'shorts');
assert.match(pack.find((item) => item.platform === 'tiktok').text, /TikTok Title: A strong hook/);

const incomplete = buildSocialPublishingPack({ ...draft, caption: '', description: '', hook: '', hashtags: [] });
assert.equal(incomplete.every((item) => item.ready), false);
assert.match(incomplete[0].warnings.join(' '), /caption/);
