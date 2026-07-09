import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import { useAIStore } from '../store/aiStore';
import type { ClipDraft, ClipSuggestion, DeletedRange, EditOperation, EditPlanResult, FillerWordResult, ProjectExportOptions, ProjectFile, Segment, Word } from '../types/project';

const AUTOSAVE_INTERVAL_MS = 5000;
const PROJECT_APP = 'ScriptCut';
const PROJECT_SCHEMA = 'scriptcut.project.v1';
const PROJECT_VERSION = 1 as const;
const PROJECT_APP_VERSION = '0.1.0';
const AUTOSAVE_INDEX_KEY = 'scriptcut.autosaves';
const RECENT_PROJECTS_KEY = 'scriptcut.recent-projects';
const AUTOSAVE_SNAPSHOT_COUNT = 3;

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
  snapshotCount?: number;
}

export interface RecentProject {
  path: string;
  videoPath: string;
  modifiedAt: string;
  source: 'project' | 'autosave';
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

export function getAutosaveSnapshotPaths(videoPath: string) {
  const current = getAutosavePath(videoPath);
  const extension = current.endsWith('.aive') ? 'aive' : 'scriptcut';
  const stem = current.slice(0, -(extension.length + 1));
  return Array.from({ length: AUTOSAVE_SNAPSHOT_COUNT }, (_, index) =>
    index === 0 ? current : `${stem}_snapshot_${index}.${extension}`,
  );
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
          typeof candidate.modifiedAt === 'string' &&
          (candidate.snapshotCount === undefined || (Number.isInteger(candidate.snapshotCount) && candidate.snapshotCount >= 0)),
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

export function listRecentProjects(): RecentProject[] {
  try {
    const raw = window.localStorage.getItem(RECENT_PROJECTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentProject[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (project) =>
          project &&
          typeof project.path === 'string' &&
          typeof project.videoPath === 'string' &&
          typeof project.modifiedAt === 'string' &&
          (project.source === 'project' || project.source === 'autosave'),
      )
      .sort((a, b) => Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt));
  } catch {
    return [];
  }
}

export function rememberRecentProject(project: RecentProject) {
  try {
    const next = [
      project,
      ...listRecentProjects().filter((item) => item.path !== project.path),
    ].slice(0, 8);
    window.localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(next));
  } catch {
    // Recent projects are a convenience layer; project files remain canonical.
  }
}

export function removeRecentProject(path: string) {
  try {
    window.localStorage.setItem(
      RECENT_PROJECTS_KEY,
      JSON.stringify(listRecentProjects().filter((project) => project.path !== path)),
    );
  } catch {
    // Ignore localStorage failures.
  }
}

async function rotateAutosaveSnapshots(videoPath: string) {
  if (!window.electronAPI?.readProjectFile || !window.electronAPI?.writeProjectFile) return;
  const paths = getAutosaveSnapshotPaths(videoPath);
  for (let index = paths.length - 1; index > 0; index--) {
    try {
      const content = await window.electronAPI.readProjectFile(paths[index - 1]);
      await window.electronAPI.writeProjectFile(paths[index], content);
    } catch {
      // A missing earlier snapshot is expected on the first few autosaves.
    }
  }
}

export function createProjectSnapshot() {
  const state = useEditorStore.getState();
  const aiState = useAIStore.getState();
  if (!state.videoPath || state.words.length === 0) return null;
  const now = new Date().toISOString();

  return {
    app: PROJECT_APP,
    schema: PROJECT_SCHEMA,
    version: PROJECT_VERSION,
    appVersion: PROJECT_APP_VERSION,
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
      editPlanInstruction: aiState.editPlanInstruction,
      editPlanResult: aiState.editPlanResult,
      editPlanDecisions: aiState.editPlanDecisions,
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

export function serializeProjectFile(project: ProjectFile) {
  return `${stableStringify(project)}\n`;
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
    schema: typeof data.schema === 'string' ? data.schema : PROJECT_SCHEMA,
    version: PROJECT_VERSION,
    appVersion: typeof data.appVersion === 'string' ? data.appVersion : PROJECT_APP_VERSION,
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
    preset: oneOf(options.preset, ['source', 'youtube-shorts', 'tiktok-reels', 'podcast-square'], 'source'),
    mode: oneOf(options.mode, ['fast', 'reencode'], 'fast'),
    resolution: oneOf(options.resolution, ['720p', '1080p', '4k'], '1080p'),
    aspectRatio: oneOf(options.aspectRatio, ['source', 'vertical', 'square'], 'source'),
    reframe: normalizeReframe(options.reframe),
    format: oneOf(options.format, ['mp4', 'mov', 'webm'], 'mp4'),
    enhanceAudio: !!options.enhanceAudio,
    captions: oneOf(options.captions, ['none', 'burn-in', 'sidecar'], 'none'),
    captionStyle: normalizeCaptionStyle(options.captionStyle),
    backgroundRemoval: normalizeBackgroundRemoval(options.backgroundRemoval),
  };
}

function oneOf<const T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
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

function normalizeCaptionStyle(style: ProjectExportOptions['captionStyle'] | undefined) {
  if (!style || typeof style !== 'object') return undefined;
  return {
    fontName: typeof style.fontName === 'string' ? style.fontName : 'Arial',
    fontSize: finiteNumber(style.fontSize, 48),
    fontColor: typeof style.fontColor === 'string' ? style.fontColor : '#ffffff',
    backgroundColor: typeof style.backgroundColor === 'string' ? style.backgroundColor : '#000000',
    position: oneOf(style.position, ['bottom', 'top', 'center'], 'bottom'),
    bold: typeof style.bold === 'boolean' ? style.bold : true,
    preset: style.preset ? oneOf(style.preset, ['clean', 'creator', 'karaoke'], 'clean') : undefined,
    highlightColor: typeof style.highlightColor === 'string' ? style.highlightColor : undefined,
    wordsPerLine: Number.isInteger(style.wordsPerLine) ? style.wordsPerLine : undefined,
  };
}

function normalizeBackgroundRemoval(background: ProjectExportOptions['backgroundRemoval'] | undefined) {
  if (!background || typeof background !== 'object') return undefined;
  return {
    enabled: !!background.enabled,
    replacement: oneOf(background.replacement, ['blur', 'color', 'image'], 'blur'),
    color: typeof background.color === 'string' ? background.color : '#111827',
    imagePath: typeof background.imagePath === 'string' ? background.imagePath : undefined,
  };
}

function finiteNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeAIWorkspace(workspace: ProjectFile['aiWorkspace']) {
  if (!workspace || typeof workspace !== 'object') {
    return {
      customFillerWords: '',
      fillerResult: null,
      fillerDecisions: {},
      editPlanInstruction: '',
      editPlanResult: null,
      editPlanDecisions: {},
      clipSuggestions: [],
      clipDrafts: [],
    };
  }

  return {
    customFillerWords:
      typeof workspace.customFillerWords === 'string' ? workspace.customFillerWords : '',
    fillerResult: normalizeFillerResult(workspace.fillerResult),
    fillerDecisions: normalizeFillerDecisions(workspace.fillerDecisions),
    editPlanInstruction:
      typeof workspace.editPlanInstruction === 'string' ? workspace.editPlanInstruction : '',
    editPlanResult: normalizeEditPlanResult(workspace.editPlanResult),
    editPlanDecisions: normalizeEditPlanDecisions(workspace.editPlanDecisions),
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

function normalizeEditPlanDecisions(decisions: unknown) {
  if (!decisions || typeof decisions !== 'object') return {};
  return Object.fromEntries(
    Object.entries(decisions).filter(
      ([id, decision]) =>
        typeof id === 'string' && id.length > 0 && (decision === 'accepted' || decision === 'rejected'),
    ),
  );
}

function normalizeEditPlanResult(result: EditPlanResult | null | undefined) {
  if (!result || typeof result !== 'object' || !Array.isArray(result.suggestions)) return null;
  const suggestions = result.suggestions.filter(
    (item) =>
      item &&
      typeof item.id === 'string' &&
      item.action === 'delete' &&
      typeof item.startWordIndex === 'number' &&
      typeof item.endWordIndex === 'number' &&
      typeof item.startTime === 'number' &&
      typeof item.endTime === 'number' &&
      typeof item.reason === 'string',
  );
  return {
    summary: typeof result.summary === 'string' ? result.summary : '',
    suggestions,
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
      status: oneOf(draft.status, ['suggested', 'draft', 'packaged', 'exporting', 'exported', 'failed'], 'draft'),
      platform: oneOf(draft.platform, ['shorts', 'generic'], 'shorts'),
      exportDirectory: typeof draft.exportDirectory === 'string' ? draft.exportDirectory : undefined,
      exportPath: typeof draft.exportPath === 'string' ? draft.exportPath : undefined,
      exportedAt: typeof draft.exportedAt === 'string' ? draft.exportedAt : undefined,
      lastError: typeof draft.lastError === 'string' ? draft.lastError : undefined,
      format: oneOf(draft.format, ['mp4', 'mov', 'webm'], 'mp4'),
      resolution: oneOf(draft.resolution, ['720p', '1080p', '4k'], '1080p'),
      aspectRatio: oneOf(draft.aspectRatio, ['source', 'vertical', 'square'], 'vertical'),
      reframe: normalizeReframe(draft.reframe),
      enhanceAudio: !!draft.enhanceAudio,
      captions: oneOf(draft.captions, ['none', 'burn-in', 'sidecar'], 'burn-in'),
      captionStyle: normalizeCaptionStyle(draft.captionStyle) || {
        preset: 'creator',
        fontName: 'Arial',
        fontSize: 58,
        fontColor: '#ffffff',
        backgroundColor: '#111827',
        position: 'bottom',
        bold: true,
        highlightColor: '#facc15',
        wordsPerLine: 5,
      },
      backgroundRemoval: normalizeBackgroundRemoval(draft.backgroundRemoval),
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

function stableStringify(value: unknown) {
  return JSON.stringify(sortForStableJson(value), null, 2);
}

function sortForStableJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForStableJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, sortForStableJson(entry)]),
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
  const editPlanInstruction = useAIStore((s) => s.editPlanInstruction);
  const editPlanResult = useAIStore((s) => s.editPlanResult);
  const editPlanDecisions = useAIStore((s) => s.editPlanDecisions);
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

    if (!window.electronAPI?.writeProjectFile) {
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
        const serialized = serializeProjectFile(snapshot);
        await rotateAutosaveSnapshots(videoPath);
        await window.electronAPI!.writeProjectFile(path, serialized);
        const previous = listAutosaveCandidates().find((candidate) => candidate.path === path);
        rememberAutosaveCandidate({
          path,
          videoPath: snapshot.videoPath,
          modifiedAt: snapshot.modifiedAt,
          snapshotCount: previous
            ? Math.min(AUTOSAVE_SNAPSHOT_COUNT - 1, (previous.snapshotCount || 0) + 1)
            : 0,
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
    editPlanInstruction,
    editPlanResult,
    editPlanDecisions,
    clipSuggestions,
    clipDrafts,
  ]);

  return autosave;
}
