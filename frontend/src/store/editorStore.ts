import { create } from 'zustand';
import { temporal } from 'zundo';
import type { Word, Segment, DeletedRange, EditOperation, EditOperationKind, ProjectExportOptions, TranscriptionResult } from '../types/project';
import type { ClipPresentationPreview } from '../utils/clipPresentation';
import { collectEditIds, createUniqueEditId, normalizeLoadedEditIds } from '../utils/editIds';
import { editorHistoryEqual, partializeEditorHistory, type EditorHistoryState } from '../utils/editorHistory';

interface EditorState {
  videoPath: string | null;
  videoUrl: string | null;
  words: Word[];
  segments: Segment[];
  deletedRanges: DeletedRange[];
  editOperations: EditOperation[];
  exportOptions: ProjectExportOptions;
  language: string;
  projectCreatedAt: string;
  projectModifiedAt: string;

  currentTime: number;
  activeWordIndex: number;
  duration: number;
  isPlaying: boolean;
  seekRequest: {
    id: number;
    time: number;
    direction: 'forward' | 'backward';
    play: boolean;
  } | null;
  previewRangeEnd: number | null;
  previewCuts: boolean;
  previewAspectRatio: 'source' | 'vertical' | 'square';
  clipPresentationPreview: ClipPresentationPreview | null;

  selectedWordIndices: number[];
  hoveredWordIndex: number | null;

  isTranscribing: boolean;
  transcriptionProgress: number;
  isExporting: boolean;
  exportProgress: number;

  backendUrl: string;
}

interface EditorActions {
  setBackendUrl: (url: string) => void;
  loadVideo: (path: string, videoUrl: string) => void;
  setTranscription: (result: TranscriptionResult) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setIsPlaying: (playing: boolean) => void;
  requestSeek: (time: number, direction?: 'forward' | 'backward', play?: boolean) => void;
  requestPreviewRange: (start: number, end: number) => void;
  clearPreviewRange: () => void;
  setPreviewCuts: (enabled: boolean) => void;
  setPreviewAspectRatio: (aspectRatio: EditorState['previewAspectRatio']) => void;
  setClipPresentationPreview: (preview: ClipPresentationPreview) => void;
  clearClipPresentationPreview: () => void;
  setExportOptions: (options: ProjectExportOptions | ((current: ProjectExportOptions) => ProjectExportOptions)) => void;
  setSelectedWordIndices: (indices: number[]) => void;
  setHoveredWordIndex: (index: number | null) => void;
  deleteSelectedWords: () => void;
  muteSelectedWords: () => void;
  replaceSelectedWordsWithRoomTone: () => void;
  hideSelectedWordsFromCaptions: () => void;
  deleteWordRange: (startIndex: number, endIndex: number) => void;
  deleteWordIndices: (indices: number[]) => void;
  addEditOperation: (kind: EditOperationKind, indices: number[]) => void;
  renameSpeaker: (speaker: string, label: string) => void;
  selectSpeakerWords: (speaker: string) => void;
  deleteSpeakerWords: (speaker: string) => void;
  restoreRange: (rangeId: string) => void;
  restoreEditOperation: (operationId: string) => void;
  setTranscribing: (active: boolean, progress?: number) => void;
  setExporting: (active: boolean, progress?: number) => void;
  getKeepSegments: () => Array<{ start: number; end: number }>;
  getMutedRanges: () => Array<{ start: number; end: number; kind: 'mute' | 'room-tone' }>;
  getCaptionHiddenIndices: () => number[];
  getWordAtTime: (time: number) => number;
  loadProject: (projectData: ProjectData, videoUrl: string) => void;
  reset: () => void;
}

interface ProjectData {
  videoPath: string;
  words?: Word[];
  segments?: Segment[];
  deletedRanges?: DeletedRange[];
  editOperations?: EditOperation[];
  exportOptions?: ProjectExportOptions;
  language?: string;
  createdAt?: string;
  modifiedAt?: string;
}

const initialState: EditorState = {
  videoPath: null,
  videoUrl: null,
  words: [],
  segments: [],
  deletedRanges: [],
  editOperations: [],
  exportOptions: {
    preset: 'source',
    mode: 'fast',
    resolution: '1080p',
    aspectRatio: 'source',
    reframe: {
      x: 50,
      y: 50,
    },
    format: 'mp4',
    enhanceAudio: false,
    captions: 'none',
    captionStyle: {
      preset: 'clean',
      fontName: 'Arial',
      fontSize: 48,
      fontColor: '#ffffff',
      backgroundColor: '#000000',
      position: 'bottom',
      bold: true,
      wordsPerLine: 8,
    },
    backgroundRemoval: {
      enabled: false,
      replacement: 'blur',
      color: '#111827',
    },
  },
  language: '',
  projectCreatedAt: '',
  projectModifiedAt: '',
  currentTime: 0,
  activeWordIndex: -1,
  duration: 0,
  isPlaying: false,
  seekRequest: null,
  previewRangeEnd: null,
  previewCuts: true,
  previewAspectRatio: 'source',
  clipPresentationPreview: null,
  selectedWordIndices: [],
  hoveredWordIndex: null,
  isTranscribing: false,
  transcriptionProgress: 0,
  isExporting: false,
  exportProgress: 0,
  backendUrl: 'http://localhost:8642',
};

export const useEditorStore = create<EditorState & EditorActions>()(
  temporal<EditorState & EditorActions, [], [], EditorHistoryState>(
    (set, get) => ({
      ...initialState,

      setBackendUrl: (url) => set({ backendUrl: url }),

      loadVideo: (path, videoUrl) => {
        const backend = get().backendUrl;
        set({
          ...initialState,
          backendUrl: backend,
          videoPath: path,
          videoUrl,
        });
        useEditorStore.temporal.getState().clear();
      },

      setTranscription: (result) => {
        let globalIdx = 0;
        const annotatedSegments = result.segments.map((seg) => {
          const annotated = { ...seg, globalStartIndex: globalIdx };
          globalIdx += seg.words.length;
          return annotated;
        });
        set({
          words: result.words,
          segments: annotatedSegments,
          language: result.language,
          activeWordIndex: getWordIndexAtTime(result.words, get().currentTime),
          deletedRanges: [],
          editOperations: [],
          selectedWordIndices: [],
          projectCreatedAt: new Date().toISOString(),
          projectModifiedAt: new Date().toISOString(),
        });
        useEditorStore.temporal.getState().clear();
      },

      setCurrentTime: (time) =>
        set((state) => {
          const activeWordIndex = getWordIndexAtTime(state.words, time);
          if (activeWordIndex === state.activeWordIndex) return { currentTime: time };
          return { currentTime: time, activeWordIndex };
        }),
      setDuration: (duration) => set({ duration }),
      setIsPlaying: (playing) => set({ isPlaying: playing }),
      requestSeek: (time, direction = 'forward', play = false) =>
        set((state) => ({
          previewRangeEnd: null,
          seekRequest: {
            id: (state.seekRequest?.id ?? 0) + 1,
            time,
            direction,
            play,
          },
        })),
      requestPreviewRange: (start, end) =>
        set((state) => ({
          previewRangeEnd: Math.max(start, end),
          seekRequest: {
            id: (state.seekRequest?.id ?? 0) + 1,
            time: start,
            direction: 'forward',
            play: true,
          },
        })),
      clearPreviewRange: () => set({ previewRangeEnd: null }),
      setPreviewCuts: (enabled) => set({ previewCuts: enabled }),
      setPreviewAspectRatio: (aspectRatio) => set({ previewAspectRatio: aspectRatio }),
      setClipPresentationPreview: (preview) => set({ clipPresentationPreview: preview }),
      clearClipPresentationPreview: () => set({ clipPresentationPreview: null }),
      setExportOptions: (options) =>
        set((state) => ({
          exportOptions: typeof options === 'function' ? options(state.exportOptions) : options,
        })),
      setSelectedWordIndices: (indices) => set({ selectedWordIndices: indices }),
      setHoveredWordIndex: (index) => set({ hoveredWordIndex: index }),

      deleteSelectedWords: () => {
        const { selectedWordIndices, words, deletedRanges, editOperations } = get();
        if (selectedWordIndices.length === 0) return;

        const sorted = [...selectedWordIndices].sort((a, b) => a - b);
        const startWord = words[sorted[0]];
        const endWord = words[sorted[sorted.length - 1]];
        const usedIds = collectEditIds(deletedRanges, editOperations);

        const newRange: DeletedRange = {
          id: createUniqueEditId('dr', usedIds),
          start: startWord.start,
          end: endWord.end,
          wordIndices: sorted,
        };

        set({
          deletedRanges: [...deletedRanges, newRange],
          editOperations: [...editOperations, deletedRangeToOperation(newRange)],
          selectedWordIndices: [],
        });
      },

      muteSelectedWords: () => {
        const { selectedWordIndices, addEditOperation } = get();
        addEditOperation('mute', selectedWordIndices);
      },

      replaceSelectedWordsWithRoomTone: () => {
        const { selectedWordIndices, addEditOperation } = get();
        addEditOperation('room-tone', selectedWordIndices);
      },

      hideSelectedWordsFromCaptions: () => {
        const { selectedWordIndices, addEditOperation } = get();
        addEditOperation('caption-only', selectedWordIndices);
      },

      deleteWordRange: (startIndex, endIndex) => {
        const { words, deletedRanges, editOperations } = get();
        const indices = [];
        for (let i = startIndex; i <= endIndex; i++) indices.push(i);
        const usedIds = collectEditIds(deletedRanges, editOperations);

        const newRange: DeletedRange = {
          id: createUniqueEditId('dr', usedIds),
          start: words[startIndex].start,
          end: words[endIndex].end,
          wordIndices: indices,
        };

        set({
          deletedRanges: [...deletedRanges, newRange],
          editOperations: [...editOperations, deletedRangeToOperation(newRange)],
        });
      },

      deleteWordIndices: (indices) => {
        const { words, deletedRanges, editOperations } = get();
        if (indices.length === 0) return;

        const sorted = [...new Set(indices)]
          .filter((index) => index >= 0 && index < words.length)
          .sort((a, b) => a - b);
        if (sorted.length === 0) return;

        const ranges: DeletedRange[] = [];
        const usedIds = collectEditIds(deletedRanges, editOperations);
        let start = sorted[0];
        let prev = sorted[0];

        const flush = () => {
          const id = createUniqueEditId('dr', usedIds);
          usedIds.add(id);
          ranges.push({
            id,
            start: words[start].start,
            end: words[prev].end,
            wordIndices: Array.from({ length: prev - start + 1 }, (_, i) => start + i),
          });
        };

        for (let i = 1; i < sorted.length; i++) {
          if (sorted[i] === prev + 1) {
            prev = sorted[i];
          } else {
            flush();
            start = sorted[i];
            prev = sorted[i];
          }
        }
        flush();

        set({
          deletedRanges: [...deletedRanges, ...ranges],
          editOperations: [...editOperations, ...ranges.map(deletedRangeToOperation)],
          selectedWordIndices: [],
        });
      },

      addEditOperation: (kind, indices) => {
        const { words, deletedRanges, editOperations } = get();
        if (indices.length === 0) return;

        const sorted = [...new Set(indices)]
          .filter((index) => index >= 0 && index < words.length)
          .sort((a, b) => a - b);
        if (sorted.length === 0) return;

        const ranges: EditOperation[] = [];
        const usedIds = collectEditIds(deletedRanges, editOperations);
        let start = sorted[0];
        let prev = sorted[0];

        const flush = () => {
          const id = createUniqueEditId('op', usedIds);
          usedIds.add(id);
          ranges.push({
            id,
            kind,
            start: words[start].start,
            end: words[prev].end,
            wordIndices: Array.from({ length: prev - start + 1 }, (_, i) => start + i),
          });
        };

        for (let i = 1; i < sorted.length; i++) {
          if (sorted[i] === prev + 1) {
            prev = sorted[i];
          } else {
            flush();
            start = sorted[i];
            prev = sorted[i];
          }
        }
        flush();

        set({
          editOperations: [...editOperations, ...ranges],
          selectedWordIndices: [],
        });
      },

      renameSpeaker: (speaker, label) => {
        const { words, segments, deletedRanges, editOperations } = get();
        const nextLabel = label.trim();
        if (!nextLabel || nextLabel === speaker) return;
        const wordIndices = words
          .map((word, index) => (word.speaker === speaker ? index : -1))
          .filter((index) => index >= 0);
        if (wordIndices.length === 0) return;
        const firstWord = words[wordIndices[0]];
        const lastWord = words[wordIndices[wordIndices.length - 1]];
        const usedIds = collectEditIds(deletedRanges, editOperations);
        const operation: EditOperation = {
          id: createUniqueEditId('op', usedIds),
          kind: 'speaker-label',
          start: firstWord.start,
          end: lastWord.end,
          wordIndices,
          originalSpeaker: speaker,
          speakerLabel: nextLabel,
        };

        set({
          words: words.map((word) =>
            word.speaker === speaker ? { ...word, speaker: nextLabel } : word,
          ),
          segments: segments.map((segment) => ({
            ...segment,
            speaker: segment.speaker === speaker ? nextLabel : segment.speaker,
            words: segment.words.map((word) =>
              word.speaker === speaker ? { ...word, speaker: nextLabel } : word,
            ),
          })),
          editOperations: [...editOperations, operation],
        });
      },

      selectSpeakerWords: (speaker) => {
        const { words } = get();
        set({
          selectedWordIndices: words
            .map((word, index) => (word.speaker === speaker ? index : -1))
            .filter((index) => index >= 0),
        });
      },

      deleteSpeakerWords: (speaker) => {
        const { words, deleteWordIndices } = get();
        deleteWordIndices(
          words
            .map((word, index) => (word.speaker === speaker ? index : -1))
            .filter((index) => index >= 0),
        );
      },

      restoreRange: (rangeId) => {
        const { deletedRanges, editOperations } = get();
        set({
          deletedRanges: deletedRanges.filter((r) => r.id !== rangeId),
          editOperations: editOperations.filter((operation) => operation.id !== rangeId),
        });
      },

      restoreEditOperation: (operationId) => {
        const { editOperations, words, segments } = get();
        const operation = editOperations.find((candidate) => candidate.id === operationId);
        if (!operation) return;

        if (operation.kind === 'delete') {
          set({
            deletedRanges: get().deletedRanges.filter((range) => range.id !== operationId),
            editOperations: editOperations.filter((candidate) => candidate.id !== operationId),
          });
          return;
        }

        if (operation.kind === 'speaker-label' && operation.originalSpeaker) {
          const affected = new Set(operation.wordIndices);
          set({
            words: words.map((word, index) =>
              affected.has(index) ? { ...word, speaker: operation.originalSpeaker } : word,
            ),
            segments: segments.map((segment) => {
              const startIndex = segment.globalStartIndex ?? 0;
              const nextWords = segment.words.map((word, localIndex) =>
                affected.has(startIndex + localIndex)
                  ? { ...word, speaker: operation.originalSpeaker }
                  : word,
              );
              return {
                ...segment,
                speaker:
                  nextWords.length > 0 && nextWords.every((word) => word.speaker === operation.originalSpeaker)
                    ? operation.originalSpeaker
                    : segment.speaker,
                words: nextWords,
              };
            }),
            editOperations: editOperations.filter((candidate) => candidate.id !== operationId),
          });
          return;
        }

        set({ editOperations: editOperations.filter((operation) => operation.id !== operationId) });
      },

      setTranscribing: (active, progress) =>
        set({
          isTranscribing: active,
          transcriptionProgress: progress ?? (active ? 0 : 100),
        }),

      setExporting: (active, progress) =>
        set({
          isExporting: active,
          exportProgress: progress ?? (active ? 0 : 100),
        }),

      getKeepSegments: () => {
        const { words, deletedRanges, duration } = get();
        if (words.length === 0) return [{ start: 0, end: duration }];

        const deletedSet = new Set<number>();
        for (const range of deletedRanges) {
          for (const idx of range.wordIndices) deletedSet.add(idx);
        }

        const segments: Array<{ start: number; end: number }> = [];
        let segStart: number | null = null;

        for (let i = 0; i < words.length; i++) {
          if (!deletedSet.has(i)) {
            if (segStart === null) segStart = words[i].start;
          } else {
            if (segStart !== null) {
              segments.push({ start: segStart, end: words[i - 1].end });
              segStart = null;
            }
          }
        }

        if (segStart !== null) {
          segments.push({ start: segStart, end: words[words.length - 1].end });
        }

        return segments;
      },

      getMutedRanges: () =>
        get()
          .editOperations.filter((operation) => operation.kind === 'mute' || operation.kind === 'room-tone')
          .map((operation) => ({
            start: operation.start,
            end: operation.end,
            kind: operation.kind as 'mute' | 'room-tone',
          })),

      getCaptionHiddenIndices: () => {
        const hidden = new Set<number>();
        for (const operation of get().editOperations) {
          if (operation.kind !== 'caption-only') continue;
          for (const index of operation.wordIndices) hidden.add(index);
        }
        return [...hidden];
      },

      getWordAtTime: (time) => {
        return getWordIndexAtTime(get().words, time);
      },

      loadProject: (data, videoUrl) => {
        const backend = get().backendUrl;
        const normalizedEdits = normalizeLoadedEditIds(
          data.deletedRanges || [],
          data.editOperations || [],
        );

        let globalIdx = 0;
        const annotatedSegments = (data.segments || []).map((seg: Segment) => {
          const annotated = { ...seg, globalStartIndex: globalIdx };
          globalIdx += seg.words.length;
          return annotated;
        });

        set({
          ...initialState,
          backendUrl: backend,
          videoPath: data.videoPath,
          videoUrl,
          words: data.words || [],
          segments: annotatedSegments,
          deletedRanges: normalizedEdits.deletedRanges,
          editOperations: normalizedEdits.editOperations,
          exportOptions: mergeExportOptions(data.exportOptions),
          language: data.language || '',
          activeWordIndex: getWordIndexAtTime(data.words || [], 0),
          projectCreatedAt: data.createdAt || '',
          projectModifiedAt: data.modifiedAt || '',
        });
        useEditorStore.temporal.getState().clear();
      },

      reset: () => {
        set(initialState);
        useEditorStore.temporal.getState().clear();
      },
    }),
    {
      limit: 100,
      partialize: partializeEditorHistory,
      equality: editorHistoryEqual,
    },
  ),
);

function deletedRangeToOperation(range: DeletedRange): EditOperation {
  return {
    id: range.id,
    kind: 'delete',
    start: range.start,
    end: range.end,
    wordIndices: range.wordIndices,
  };
}

function getWordIndexAtTime(words: Word[], time: number) {
  if (words.length === 0) return -1;

  let lo = 0;
  let hi = words.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const word = words[mid];
    if (word.end < time) lo = mid + 1;
    else if (word.start > time) hi = mid - 1;
    else return mid;
  }

  const previous = hi >= 0 ? hi : -1;
  const next = lo < words.length ? lo : -1;
  const previousDistance = previous >= 0 ? Math.abs(time - words[previous].end) : Number.POSITIVE_INFINITY;
  const nextDistance = next >= 0 ? Math.abs(words[next].start - time) : Number.POSITIVE_INFINITY;
  const nearestDistance = Math.min(previousDistance, nextDistance);

  if (nearestDistance > 0.35) return -1;
  return previousDistance <= nextDistance ? previous : next;
}

function mergeExportOptions(options?: ProjectExportOptions): ProjectExportOptions {
  const defaults = initialState.exportOptions;
  return {
    ...defaults,
    ...options,
    reframe: {
      x: options?.reframe?.x ?? defaults.reframe?.x ?? 50,
      y: options?.reframe?.y ?? defaults.reframe?.y ?? 50,
    },
    captionStyle: {
      fontName: defaults.captionStyle?.fontName ?? 'Arial',
      fontSize: defaults.captionStyle?.fontSize ?? 48,
      fontColor: defaults.captionStyle?.fontColor ?? '#ffffff',
      backgroundColor: defaults.captionStyle?.backgroundColor ?? '#000000',
      position: defaults.captionStyle?.position ?? 'bottom',
      bold: defaults.captionStyle?.bold ?? true,
      wordsPerLine: defaults.captionStyle?.wordsPerLine ?? 8,
      ...options?.captionStyle,
    },
    backgroundRemoval: {
      enabled: defaults.backgroundRemoval?.enabled ?? false,
      replacement: defaults.backgroundRemoval?.replacement ?? 'blur',
      color: defaults.backgroundRemoval?.color ?? '#111827',
      ...options?.backgroundRemoval,
    },
  };
}
