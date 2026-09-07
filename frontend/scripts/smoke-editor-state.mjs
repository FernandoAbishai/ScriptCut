import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from 'zustand/vanilla';
import { temporal } from 'zundo';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const __dirname = dirname(fileURLToPath(import.meta.url));

function loadTypescriptModule(relativePath) {
  const source = readFileSync(resolve(__dirname, relativePath), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  });
  const module = { exports: {} };
  const run = new Function('exports', 'module', 'require', compiled.outputText);
  run(module.exports, module, require);
  return module.exports;
}

const {
  collectEditIds,
  createUniqueEditId,
  normalizeLoadedEditIds,
} = loadTypescriptModule('../src/utils/editIds.ts');
const {
  editorHistoryEqual,
  partializeEditorHistory,
} = loadTypescriptModule('../src/utils/editorHistory.ts');

const legacyCollisionIds = new Set(['dr_legacy', 'dr_legacy_1']);
assert.equal(
  createUniqueEditId('dr', legacyCollisionIds, () => 'legacy'),
  'dr_legacy_2',
);

const migrated = normalizeLoadedEditIds(
  [
    { id: 'dr_1', start: 0, end: 0.5, wordIndices: [0] },
    { id: 'dr_1', start: 1, end: 1.5, wordIndices: [2] },
  ],
  [
    { id: 'dr_1', kind: 'delete', start: 0, end: 0.5, wordIndices: [0] },
    { id: 'dr_1', kind: 'delete', start: 1, end: 1.5, wordIndices: [2] },
    { id: 'op_1', kind: 'mute', start: 2, end: 2.5, wordIndices: [4] },
    { id: 'op_1', kind: 'caption-only', start: 3, end: 3.5, wordIndices: [6] },
  ],
);

assert.equal(migrated.deletedRanges[0].id, 'dr_1', 'first legacy ID should stay stable');
assert.notEqual(migrated.deletedRanges[1].id, 'dr_1', 'duplicate legacy delete ID must be repaired');
assert.deepEqual(
  migrated.editOperations.filter((operation) => operation.kind === 'delete').map((operation) => operation.id),
  migrated.deletedRanges.map((range) => range.id),
  'delete operation IDs must remain paired with their ranges after migration',
);
assert.equal(migrated.editOperations[2].id, 'op_1', 'first unique non-delete legacy ID should stay stable');
assert.notEqual(migrated.editOperations[3].id, 'op_1', 'duplicate non-delete legacy ID must be repaired');

const migratedLogicalIds = collectEditIds(
  migrated.deletedRanges,
  migrated.editOperations.filter((operation) => operation.kind !== 'delete'),
);
assert.equal(
  migratedLogicalIds.size,
  migrated.deletedRanges.length + migrated.editOperations.filter((operation) => operation.kind !== 'delete').length,
);

const baseTrackedState = {
  words: [],
  segments: [],
  deletedRanges: [],
  editOperations: [],
  exportOptions: { preset: 'source' },
};

const historyStore = createStore(
  temporal(
    (set) => ({
      ...baseTrackedState,
      currentTime: 0,
      isPlaying: false,
      setCurrentTime: (currentTime) => set({ currentTime }),
      setIsPlaying: (isPlaying) => set({ isPlaying }),
      deleteWord: () => set((state) => ({
        deletedRanges: [...state.deletedRanges, { id: 'dr_test', start: 0, end: 1, wordIndices: [0] }],
      })),
    }),
    {
      limit: 100,
      partialize: partializeEditorHistory,
      equality: editorHistoryEqual,
    },
  ),
);

historyStore.getState().setCurrentTime(12.5);
historyStore.getState().setIsPlaying(true);
historyStore.getState().setCurrentTime(13);
assert.equal(historyStore.temporal.getState().pastStates.length, 0, 'playback state must not consume undo history');

historyStore.getState().deleteWord();
assert.equal(historyStore.temporal.getState().pastStates.length, 1, 'durable edit should create one undo entry');
historyStore.getState().setCurrentTime(14);
assert.equal(historyStore.temporal.getState().pastStates.length, 1, 'transient playback after edit must not add history');

const appSource = readFileSync(resolve(__dirname, '../src/App.tsx'), 'utf8');
const editorStoreSource = readFileSync(resolve(__dirname, '../src/store/editorStore.ts'), 'utf8');
assert.match(appSource, /onClick=\{\(\) => void handleOpenFile\(currentWorkflowIntent\)\}/);
assert.doesNotMatch(appSource, /onClick=\{handleOpenFile\}/);
assert.match(editorStoreSource, /partialize:\s*partializeEditorHistory/);
assert.match(editorStoreSource, /equality:\s*editorHistoryEqual/);
assert.doesNotMatch(editorStoreSource, /nextRangeId/);
assert.ok(
  (editorStoreSource.match(/temporal\.getState\(\)\.clear\(\)/g) || []).length >= 4,
  'new media, transcription, project load, and reset must clear cross-project undo history',
);
