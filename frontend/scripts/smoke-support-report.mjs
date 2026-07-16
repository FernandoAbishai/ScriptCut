import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, '../src/utils/supportReport.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});
const module = { exports: {} };
new Function('exports', 'module', 'require', compiled.outputText)(module.exports, module, require);

const { buildSupportReport, redactSupportText } = module.exports;

assert.equal(redactSupportText('/Users/fernando/Videos/source.mp4'), '<local-path>');
assert.equal(redactSupportText('C:\\Users\\fernando\\Videos\\source.mp4'), '<local-path>');
assert.doesNotMatch(redactSupportText('api_key=sk-secret-value'), /secret-value/);
assert.match(redactSupportText('api_key=sk-secret-value'), /<redacted/);

const report = buildSupportReport({
  fallbackVersion: '0.1.0-alpha',
  app: { version: '0.1.0', platform: 'darwin', arch: 'arm64', packaged: true, electron: '43.1.0' },
  runtime: { ffmpeg: { available: true, version: 'ffmpeg 8.1', captionFallback: 'sidecar-srt' } },
  jobs: [{ kind: 'export', status: 'failed', progress: 42, message: 'Could not open /Users/fernando/output.mp4', logs: [{ message: 'token=top-secret' }] }],
});

assert.match(report, /video \+ SRT sidecar/);
assert.doesNotMatch(report, /fernando|top-secret|\/Users/);
