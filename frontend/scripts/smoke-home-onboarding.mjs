import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const __dirname = dirname(fileURLToPath(import.meta.url));
const homeSource = readFileSync(resolve(__dirname, '../src/components/HomeScreen.tsx'), 'utf8');
const appSource = readFileSync(resolve(__dirname, '../src/App.tsx'), 'utf8');
const readinessSource = readFileSync(resolve(__dirname, '../src/utils/homeReadiness.ts'), 'utf8');

assert.match(homeSource, /title="Edit a Video"/);
assert.match(homeSource, /title="Create Clips"/);
assert.match(homeSource, />\s*Open Project\s*</);
assert.match(homeSource, /src="\.\/brand\/scriptcut-mark\.svg"/);
assert.match(homeSource, /src="\.\/brand\/scriptcut-wordmark\.svg"/);
assert.doesNotMatch(homeSource, /src="\/brand\//);
assert.doesNotMatch(homeSource, /title="Create a short"/);
assert.match(homeSource, /const \[setupDetailsOpen, setSetupDetailsOpen\] = useState\(false\)/);
assert.doesNotMatch(homeSource, /useState\(!onboardingDismissed\)/);
assert.doesNotMatch(homeSource, /if \(!onboardingDismissed\)/);
assert.match(homeSource, /if \(readiness === 'needs-setup'\) setSetupDetailsOpen\(true\)/);
assert.doesNotMatch(homeSource, /primary\??\s*(?:=|:)/);
assert.doesNotMatch(homeSource, /bg-editor-accent text-white/);
assert.match(homeSource, /Advanced transcription/);
assert.match(homeSource, /Automatic — Recommended/);
assert.match(homeSource, /Recover/);
assert.match(homeSource, /Earlier/);
assert.match(homeSource, /Dismiss/);
assert.match(homeSource, /Development \/ browser mode/);
assert.match(homeSource, /native file access, autosave and direct exports/);
assert.match(homeSource, /onShowSetup\(\)/);
assert.match(homeSource, /getSetupGuidance\(row, isElectron\)/);
assert.match(homeSource, /The ScriptCut desktop app includes its local editing runtime/);
assert.match(homeSource, /Desktop releases include the video export engine/);
assert.match(homeSource, /Source development uses Python 3\.11/);

assert.match(appSource, /onOpenWorkflow=\{handleStartWorkflow\}/);
assert.match(appSource, /src="\.\/brand\/scriptcut-mark\.svg"/);
assert.doesNotMatch(appSource, /src="\/brand\//);
assert.match(appSource, /if \(coreReadiness === 'needs-setup'\)/);
assert.match(appSource, /intent === 'short'/);
assert.match(appSource, /captions: 'none'/);
assert.match(appSource, /captions: 'burn-in'/);

const compiled = ts.transpileModule(readinessSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
});
const module = { exports: {} };
new Function('exports', 'module', 'require', compiled.outputText)(module.exports, module, require);

const { getCoreReadiness, getCoreReadinessBlockers } = module.exports;
const readyCore = {
  backend: { ok: true },
  python: { ok: true },
  transcription: { ok: true },
  ffmpeg: { ok: true },
  background: { ok: false },
  audio: { ok: false },
  captions: { ok: false },
};
assert.equal(getCoreReadiness(readyCore), 'ready');
assert.deepEqual(getCoreReadinessBlockers(readyCore), []);
assert.equal(getCoreReadiness({ ...readyCore, backend: { ok: false } }), 'needs-setup');
assert.deepEqual(getCoreReadinessBlockers({ ...readyCore, transcription: { ok: false } }), ['transcription']);
assert.equal(getCoreReadiness(undefined, { isChecking: true }), 'checking');
assert.equal(getCoreReadiness(readyCore, { backendStartupError: 'backend failed' }), 'needs-setup');
