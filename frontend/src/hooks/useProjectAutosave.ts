import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import { useAIStore } from '../store/aiStore';
import type { ClipDraft, ClipSuggestion, DeletedRange, EditOperation, FillerWordResult, ProjectExportOptions, ProjectFile, Segment, Word } from '../types/project';

const AUTOSAVE_INTERVAL_MS = 5000;
const PROJECT_APP = 'ScriptCut';
const PROJECT_VERSION = 1;
const AUTOSAVE_INDEX_KEY = 'scriptcut.autosaves';

export interface AutosaveState {
  status: 'idle' | 'saving' | 'saved' | 'error' | 'unavailable';
  savedAt: string;
  path: string;
  error: string;
}

export interface AutosaveCandidate {
  path: string;
  videoPath: string;
  modifiedAt: string;
}

export function getAutosavePath(videoPath: string) {
  return getAutosavePathWithExtension(videoPath, 'scriptcut');
}

export function getLegacyAutosavePath(videoPath: string) {
  return getAutosavePathWithExtension(videoPath, 'aive');
}

export function getAutosaveCandidatePaths(videoPath: string) {
  const current = getAutosavePath(videoPath);
  const legacy = getLegacyAutosavePath(videoPath);
  return current === legacy ? [current] : [current, legacy];
}

function getAutosavePathWithExtension(videoPath: string, extension: 'scriptcut' | 'aive') {
  const autosavePath = videoPath.replace(/\.[^.\\/]+$/, `_autosave.${extension}`);
  return autosavePath === videoPath ? `${videoPath}_autosave.${extension}` : autosavePath;
}

export function listAutosaveCandidates(): AutosaveCandidate[] {
  try {
    const raw = window.localStorage.getItem(AUTOSAVE_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AutosaveCandidate[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (candidate) =>
          candidate &&
          typeof candidate.path === 'string' &&
          typeof candidate.videoPath === 'string' &&
          typeof candidate.modifiedAt === 'string',
      )
      .sort((a, b) => Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt));
  } catch {
    return [];
  }
}

export function rememberAutosaveCandidate(candidate: AutosaveCandidate) {
  try {
    const next = [
      candidate,
      ...listAutosaveCandidates().filter((item) => item.path !== candidate.path),
    ].slice(0, 12);
    window.localStorage.setItem(AUTOSAVE_INDEX_KEY, JSON.stringify(next));
  } catch {
    // Recovery index is best effort; the autosave file itself is the source of truth.
  }
}

export function removeAutosaveCandidate(path: string) {
  try {
    const next = listAutosaveCandidates().filter((candidate) => candidate.path !== path);
    window.localStorage.setItem(AUTOSAVE_INDEX_KEY, JSON.stringify(next));
  } catch {
    // Ignore localStorage failures.
  }
}

export function createProjectSnapshot() {
  const state = useEditorStore.getState();
  const aiState = useAIStore.getState();
  if (!state.videoPath || state.words.length === 0) return null;
  const now = new Date().toISOString();

  return {
    app: PROJECT_APP,
    version: PROJECT_VERSION,
    videoPath: state.videoPath,
    words: state.words,
    segments: state.segments,
    deletedRanges: state.deletedRanges,
    editOperations: state.editOperations,
    exportOptions: state.exportOptions,
    aiWorkspace: {
      customFillerWords: aiState.customFillerWords,
      fillerResult: aiState.fillerResult,
      fillerDecisions: aiState.fillerDecisions,
      clipSuggestions: aiState.clipSuggestions,
      clipDrafts: aiState.clipDrafts,
    },
    language: state.language,
    createdAt: state.projectCreatedAt || now,
    modifiedAt: now,
  };
}

export function parseProjectFile(content: string) {
  const raw = JSON.parse(content);
  return normalizeProjectFile(raw);
}

export function normalizeProjectFile(raw: unknown): ProjectFile {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Project file is not a JSON object');
  }

  const data = raw as Partial<ProjectFile> & { app?: string };
  if (data.version !== PROJECT_VERSION) {
    throw new Error(`Unsupported project version: ${String(data.version)}`);
  }
  if (typeof data.videoPath !== 'string' || data.videoPath.length === 0) {
    throw new Error('Project is missing videoPath');
  }
  if (!Array.isArray(data.words)) {
    throw new Error('Project is missing words');
  }

  const now = new Date().toISOString();
  return {
    app: typeof data.app === 'string' ? data.app : PROJECT_APP,
    version: PROJECT_VERSION,
    videoPath: data.videoPath,
    words: normalizeWords(data.words),
    segments: normalizeSegments(data.segments || []),
    deletedRanges: normalizeDeletedRanges(data.deletedRanges || []),
    editOperations: normalizeEditOperations(data.editOperations || []),
    exportOptions: normalizeExportOptions(data.exportOptions),
    aiWorkspace: normalizeAIWorkspace(data.aiWorkspace),
    language: typeof data.language === 'string' ? data.language : '',
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : now,
    modifiedAt: typeof data.modifiedAt === 'string' ? data.modifiedAt : now,
  };
}

function normalizeExportOptions(options: ProjectExportOptions | undefined): ProjectExportOptions | undefined {
  if (!options || typeof options !== 'object') return undefined;
  return {
    preset: options.preset || 'source',
    mode: options.mode || 'fast',
    resolution: options.resolution || '1080p',
    aspectRatio: options.aspectRatio || 'source',
    reframe: normalizeReframe(options.reframe),
    format: options.format || 'mp4',
    enhanceAudio: !!options.enhanceAudio,
    captions: options.captions || 'none',
    captionStyle: options.captionStyle,
    backgroundRemoval: options.backgroundRemoval,
  };
}

function normalizeReframe(reframe: ProjectExportOptions['reframe'] | undefined) {
  if (!reframe || typeof reframe !== 'object') return { x: 50, y: 50 };
  return {
    x: clampPercent(reframe.x),
    y: clampPercent(reframe.y),
  };
}

function clampPercent(value: unknown) {
  return Math.max(0, Math.min(100, typeof value === 'number' && Number.isFinite(value) ? value : 50));
}

function normalizeAIWorkspace(workspace: ProjectFile['aiWorkspace']) {
  if (!workspace || typeof workspace !== 'object') {
    return {
      customFillerWords: '',
      fillerResult: null,
      fillerDecisions: {},
      clipSuggestions: [],
      clipDrafts: [],
    };
  }

  return {
    customFillerWords:
      typeof workspace.customFillerWords === 'string' ? workspace.customFillerWords : '',
    fillerResult: normalizeFillerResult(workspace.fillerResult),
    fillerDecisions: normalizeFillerDecisions(workspace.fillerDecisions),
    clipSuggestions: normalizeClipSuggestions(workspace.clipSuggestions || []),
    clipDrafts: normalizeClipDrafts(workspace.clipDrafts || []),
  };
}

function normalizeFillerDecisions(decisions: unknown) {
  if (!decisions || typeof decisions !== 'object') return {};
  return Object.fromEntries(
    Object.entries(decisions).filter(
      ([index, decision]) =>
        Number.isInteger(Number(index)) && (decision === 'accepted' || decision === 'rejected'),
    ),
  );
}

function normalizeFillerResult(result: FillerWordResult | null | undefined) {
  if (!result || typeof result !== 'object' || !Array.isArray(result.fillerWords)) return null;
  const fillerWords = result.fillerWords.filter(
    (item) =>
      item &&
      typeof item.index === 'number' &&
      typeof item.word === 'string' &&
      typeof item.reason === 'string',
  );
  return {
    wordIndices: fillerWords.map((item) => item.index),
    fillerWords,
  };
}

function normalizeClipSuggestions(suggestions: ClipSuggestion[]) {
  return suggestions.filter(
    (clip) =>
      clip &&
      typeof clip.title === 'string' &&
      typeof clip.startWordIndex === 'number' &&
      typeof clip.endWordIndex === 'number' &&
      typeof clip.startTime === 'number' &&
      typeof clip.endTime === 'number' &&
      typeof clip.reason === 'string',
  );
}

function normalizeClipDrafts(drafts: ClipDraft[]) {
  return drafts
    .filter((draft) => typeof draft.id === 'string')
    .map((draft) => ({
      ...draft,
      format: draft.format || 'mp4',
      resolution: draft.resolution || '1080p',
      aspectRatio: draft.aspectRatio || 'source',
      reframe: normalizeReframe(draft.reframe),
      enhanceAudio: !!draft.enhanceAudio,
      captions: draft.captions || 'none',
      captionStyle: draft.captionStyle,
      backgroundRemoval: draft.backgroundRemoval,
    }));
}

function normalizeWords(words: Word[]) {
  return words.filter(
    (word) =>
      word &&
      typeof word.word === 'string' &&
      typeof word.start === 'number' &&
      typeof word.end === 'number',
  );
}

function normalizeSegments(segments: Segment[]) {
  return segments
    .filter((segment) => segment && typeof segment.start === 'number' && typeof segment.end === 'number')
    .map((segment) => ({
      ...segment,
      words: normalizeWords(segment.words || []),
      globalStartIndex: segment.globalStartIndex ?? 0,
    }));
}

function normalizeDeletedRanges(ranges: DeletedRange[]) {
  return ranges.filter(
    (range) =>
      range &&
      typeof range.id === 'string' &&
      typeof range.start === 'number' &&
      typeof range.end === 'number' &&
      Array.isArray(range.wordIndices),
  );
}

function normalizeEditOperations(operations: EditOperation[]) {
  return operations.filter(
    (operation) =>
      operation &&
      typeof operation.id === 'string' &&
      (operation.kind === 'delete' ||
        operation.kind === 'mute' ||
        operation.kind === 'caption-only' ||
        operation.kind === 'speaker-label' ||
        operation.kind === 'room-tone') &&
      typeof operation.start === 'number' &&
      typeof operation.end === 'number' &&
      Array.isArray(operation.wordIndices),
  );
}

export function useProjectAutosave() {
  const videoPath = useEditorStore((s) => s.videoPath);
  const words = useEditorStore((s) => s.words);
  const segments = useEditorStore((s) => s.segments);
  const deletedRanges = useEditorStore((s) => s.deletedRanges);
  const editOperations = useEditorStore((s) => s.editOperations);
  const exportOptions = useEditorStore((s) => s.exportOptions);
  const language = useEditorStore((s) => s.language);
  const customFillerWords = useAIStore((s) => s.customFillerWords);
  const fillerResult = useAIStore((s) => s.fillerResult);
  const fillerDecisions = useAIStore((s) => s.fillerDecisions);
  const clipSuggestions = useAIStore((s) => s.clipSuggestions);
  const clipDrafts = useAIStore((s) => s.clipDrafts);
  const lastSavedRef = useRef('');
  const [autosave, setAutosave] = useState<AutosaveState>({
    status: 'idle',
    savedAt: '',
    path: '',
    error: '',
  });

  useEffect(() => {
    if (!videoPath || words.length === 0) {
      setAutosave({ status: 'idle', savedAt: '', path: '', error: '' });
      lastSavedRef.current = '';
      return;
    }

    if (!window.electronAPI?.writeFile) {
      setAutosave({ status: 'unavailable', savedAt: '', path: '', error: '' });
      return;
    }

    const save = async () => {
      const snapshot = createProjectSnapshot();
      if (!snapshot) return;

      const saveKey = JSON.stringify({
        videoPath: snapshot.videoPath,
        words: snapshot.words,
        segments: snapshot.segments,
        deletedRanges: snapshot.deletedRanges,
        editOperations: snapshot.editOperations,
        exportOptions: snapshot.exportOptions,
        aiWorkspace: snapshot.aiWorkspace,
        language: snapshot.language,
      });
      if (saveKey === lastSavedRef.current) return;

      try {
        const path = getAutosavePath(videoPath);
        setAutosave((current) => ({ ...current, status: 'saving', path, error: '' }));
        const serialized = JSON.stringify(snapshot, null, 2);
        await window.electronAPI!.writeFile(path, serialized);
        rememberAutosaveCandidate({
          path,
          videoPath: snapshot.videoPath,
          modifiedAt: snapshot.modifiedAt,
        });
        lastSavedRef.current = saveKey;
        setAutosave({ status: 'saved', savedAt: snapshot.modifiedAt, path, error: '' });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setAutosave({
          status: 'error',
          savedAt: '',
          path: getAutosavePath(videoPath),
          error: message,
        });
        console.warn('Project autosave failed:', err);
      }
    };

    void save();
    const id = window.setInterval(save, AUTOSAVE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [
    videoPath,
    words,
    segments,
    deletedRanges,
    editOperations,
    exportOptions,
    language,
    customFillerWords,
    fillerResult,
    fillerDecisions,
    clipSuggestions,
    clipDrafts,
  ]);

  return autosave;
}
