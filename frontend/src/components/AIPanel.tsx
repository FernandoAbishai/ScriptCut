import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import { useAIStore } from '../store/aiStore';
import { Sparkles, Scissors, Film, Loader2, Check, X, Play, Download, RotateCcw, Plus, Users, Filter, Image, Clipboard } from 'lucide-react';
import type { CaptionStyle, ClipDraft, ClipDraftStatus, ClipSuggestion, EditPlanReviewDecision, EditPlanResult, EditPlanSuggestion, FillerReviewDecision, FillerWordResult, Word } from '../types/project';
import {
  getClipTranscript,
  getWordIndicesForClip,
  normalizeClipDraftRange,
  validateClipDraftForExport,
} from '../utils/clipDrafts';
import { buildSocialPublishingPack, type SocialPlatform } from '../utils/socialPublishing';
import {
  buildHookFrameCandidates,
  formatHookFrameBrief,
  getSelectedHookFrame,
  type HookFrameCandidate,
} from '../utils/hookFrames';
import CaptionPreview from './CaptionPreview';

type FillerQueueFilter = 'all' | 'unreviewed' | 'safe' | 'review' | 'low' | 'accepted' | 'rejected';

type AIJob<T> = {
  id: string;
  kind: string;
  status: 'queued' | 'running' | 'canceling' | 'succeeded' | 'failed' | 'canceled';
  progress: number;
  message: string;
  logs?: Array<{ time: string; message: string }>;
  result?: T;
  error?: string;
};

type AIJobContext = {
  label: string;
  draftId?: string;
};

type ExportJob = {
  id: string;
  status: 'queued' | 'running' | 'canceling' | 'succeeded' | 'failed' | 'canceled';
  progress: number;
  message: string;
  logs?: Array<{ time: string; message: string }>;
  result?: { output_path?: string; srt_path?: string };
  error?: string;
};

type BackgroundCapabilities = {
  available: boolean;
  mediapipe: boolean;
  opencv: boolean;
  rvm: boolean;
  replacements: string[];
};

type ClipMetadataResult = {
  hook?: string;
  titles?: string[];
  description?: string;
  caption?: string;
  hashtags?: string[];
};

type BatchExportResult = {
  draft: ClipDraft;
  outputPath?: string;
  error?: string;
};

const CLIP_CAPTION_PRESETS: Record<NonNullable<CaptionStyle['preset']>, CaptionStyle> = {
  clean: {
    preset: 'clean',
    fontName: 'Arial',
    fontSize: 48,
    fontColor: '#ffffff',
    backgroundColor: '#000000',
    position: 'bottom',
    bold: true,
    wordsPerLine: 8,
  },
  creator: {
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
  karaoke: {
    preset: 'karaoke',
    fontName: 'Arial',
    fontSize: 64,
    fontColor: '#facc15',
    backgroundColor: '#000000',
    position: 'center',
    bold: true,
    highlightColor: '#22c55e',
    wordsPerLine: 3,
  },
};

const SHORTS_DRAFT_DEFAULTS = {
  format: 'mp4',
  resolution: '1080p',
  aspectRatio: 'vertical',
  reframe: { x: 50, y: 50 },
  enhanceAudio: false,
  captions: 'burn-in',
  captionStyle: CLIP_CAPTION_PRESETS.creator,
  backgroundRemoval: { enabled: false, replacement: 'blur', color: '#111827' },
  platform: 'shorts',
} satisfies Pick<ClipDraft, 'format' | 'resolution' | 'aspectRatio' | 'reframe' | 'enhanceAudio' | 'captions' | 'captionStyle' | 'backgroundRemoval' | 'platform'>;

const EXPORTABLE_DRAFT_STATUSES = new Set<ClipDraftStatus>(['draft', 'packaged', 'failed']);

export default function AIPanel() {
  const {
    words,
    videoPath,
    backendUrl,
    deletedRanges,
    deleteWordRange,
    restoreRange,
    requestSeek,
    setPreviewAspectRatio,
    setExportOptions,
    getMutedRanges,
    getCaptionHiddenIndices,
    setSelectedWordIndices,
    activeWordIndex,
  } = useEditorStore();
  const {
    defaultProvider,
    providers,
    customFillerWords,
    fillerResult,
    fillerDecisions,
    editPlanInstruction,
    editPlanResult,
    editPlanDecisions,
    clipSuggestions,
    clipDrafts,
    isProcessing,
    processingMessage,
    setCustomFillerWords,
    setFillerResult,
    setFillerDecisions,
    setEditPlanInstruction,
    setEditPlanResult,
    setEditPlanDecisions,
    setClipSuggestions,
    setClipDrafts,
    setProcessing,
  } = useAIStore();

  const [activeTab, setActiveTab] = useState<'edit' | 'filler' | 'clips'>('edit');
  const [fillerQueueFilter, setFillerQueueFilter] = useState<FillerQueueFilter>('all');
  const [fillerReasonFilter, setFillerReasonFilter] = useState('all');
  const [activeAIJob, setActiveAIJob] = useState<(AIJob<unknown> & AIJobContext) | null>(null);
  const [backgroundCapabilities, setBackgroundCapabilities] = useState<BackgroundCapabilities | null>(null);
  const [activeClipDraftId, setActiveClipDraftId] = useState<string | null>(null);
  const [clipExportDirectory, setClipExportDirectory] = useState('');
  const deletedWordMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const range of deletedRanges) {
      for (const index of range.wordIndices) map.set(index, range.id);
    }
    return map;
  }, [deletedRanges]);

  useEffect(() => {
    let canceled = false;
    fetch(`${backendUrl}/background/capabilities`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!canceled) setBackgroundCapabilities(data);
      })
      .catch(() => {
        if (!canceled) setBackgroundCapabilities(null);
      });
    return () => {
      canceled = true;
    };
  }, [backendUrl]);

  useEffect(() => {
    if (!videoPath) return;
    setClipExportDirectory((current) => current || getPathDirectory(videoPath));
  }, [videoPath]);

  const reviewedCount = useMemo(() => {
    if (!fillerResult) return 0;
    return fillerResult.fillerWords.filter(
      (fw) => fillerDecisions[fw.index] || deletedWordMap.has(fw.index),
    ).length;
  }, [fillerResult, fillerDecisions, deletedWordMap]);

  const safeFillerCount = useMemo(() => {
    if (!fillerResult) return 0;
    return fillerResult.fillerWords.filter(
      (fw) =>
        (fw.confidence ?? 0) >= 0.85 &&
        fillerDecisions[fw.index] !== 'rejected' &&
        !deletedWordMap.has(fw.index),
    ).length;
  }, [deletedWordMap, fillerDecisions, fillerResult]);

  const fillerReasonBuckets = useMemo(() => {
    if (!fillerResult) return [];
    const buckets = new Map<string, number>();
    for (const fw of fillerResult.fillerWords) {
      const bucket = getFillerReasonBucket(fw.word, fw.reason);
      buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
    }
    return Array.from(buckets.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [fillerResult]);

  const visibleFillerWords = useMemo(() => {
    if (!fillerResult) return [];
    return fillerResult.fillerWords.filter((fw) => {
      const confidence = fw.confidence ?? 0;
      const decision = fillerDecisions[fw.index];
      const alreadyCut = deletedWordMap.has(fw.index);
      const reasonBucket = getFillerReasonBucket(fw.word, fw.reason);

      if (fillerReasonFilter !== 'all' && reasonBucket !== fillerReasonFilter) return false;
      if (fillerQueueFilter === 'safe') return confidence >= 0.85 && !decision && !alreadyCut;
      if (fillerQueueFilter === 'review') return confidence >= 0.6 && confidence < 0.85 && !decision && !alreadyCut;
      if (fillerQueueFilter === 'low') return confidence < 0.6 && !decision && !alreadyCut;
      if (fillerQueueFilter === 'unreviewed') return !decision && !alreadyCut;
      if (fillerQueueFilter === 'accepted') return decision === 'accepted' || alreadyCut;
      if (fillerQueueFilter === 'rejected') return decision === 'rejected';
      return true;
    });
  }, [deletedWordMap, fillerDecisions, fillerQueueFilter, fillerReasonFilter, fillerResult]);

  const editPlanReviewedCount = useMemo(() => {
    if (!editPlanResult) return 0;
    return editPlanResult.suggestions.filter(
      (suggestion) => editPlanDecisions[suggestion.id] || isEditSuggestionAlreadyCut(suggestion, deletedWordMap),
    ).length;
  }, [deletedWordMap, editPlanDecisions, editPlanResult]);

  const pendingEditSuggestions = useMemo(() => {
    if (!editPlanResult) return [];
    return editPlanResult.suggestions.filter(
      (suggestion) =>
        editPlanDecisions[suggestion.id] !== 'rejected' &&
        !isEditSuggestionAlreadyCut(suggestion, deletedWordMap),
    );
  }, [deletedWordMap, editPlanDecisions, editPlanResult]);

  const acceptVisibleFillerDeletions = useCallback(() => {
    const sorted = visibleFillerWords
      .filter((fw) => fillerDecisions[fw.index] !== 'rejected' && !deletedWordMap.has(fw.index))
      .sort((a, b) => b.index - a.index);
    for (const fw of sorted) {
      deleteWordRange(fw.index, fw.index);
    }
    setFillerDecisions((current) => {
      const next = { ...current };
      for (const fw of sorted) next[fw.index] = 'accepted';
      return next;
    });
  }, [deletedWordMap, deleteWordRange, fillerDecisions, setFillerDecisions, visibleFillerWords]);

  const previewEditSuggestion = useCallback(
    (suggestion: EditPlanSuggestion) => {
      requestSeek(Math.max(0, suggestion.startTime - 0.35), 'backward', true);
    },
    [requestSeek],
  );

  const acceptEditSuggestion = useCallback(
    (suggestion: EditPlanSuggestion) => {
      if (!isEditSuggestionAlreadyCut(suggestion, deletedWordMap)) {
        deleteWordRange(suggestion.startWordIndex, suggestion.endWordIndex);
      }
      setEditPlanDecisions((current) => ({ ...current, [suggestion.id]: 'accepted' }));
    },
    [deletedWordMap, deleteWordRange, setEditPlanDecisions],
  );

  const rejectEditSuggestion = useCallback(
    (id: string) => {
      setEditPlanDecisions((current) => ({ ...current, [id]: 'rejected' }));
    },
    [setEditPlanDecisions],
  );

  const applyPendingEditSuggestions = useCallback(() => {
    const sorted = [...pendingEditSuggestions].sort((a, b) => b.startWordIndex - a.startWordIndex);
    for (const suggestion of sorted) {
      deleteWordRange(suggestion.startWordIndex, suggestion.endWordIndex);
    }
    setEditPlanDecisions((current) => {
      const next = { ...current };
      for (const suggestion of sorted) next[suggestion.id] = 'accepted';
      return next;
    });
  }, [deleteWordRange, pendingEditSuggestions, setEditPlanDecisions]);

  const speakerTurnClips = useMemo(() => {
    const turns: ClipSuggestion[] = [];
    if (words.length === 0 || !words.some((word) => word.speaker)) return turns;

    let startIndex = 0;
    let currentSpeaker = words[0].speaker || null;
    const flush = (endIndex: number) => {
      if (!currentSpeaker) return;
      const startWord = words[startIndex];
      const endWord = words[endIndex];
      if (!startWord || !endWord) return;
      const duration = endWord.end - startWord.start;
      if (duration < 2) return;
      turns.push({
        title: `${currentSpeaker} ${formatClipTime(startWord.start)} turn`,
        startWordIndex: startIndex,
        endWordIndex: endIndex,
        startTime: startWord.start,
        endTime: endWord.end,
        reason: `${currentSpeaker} speaks for ${Math.round(duration)} seconds.`,
      });
    };

    for (let index = 1; index < words.length; index++) {
      const speaker = words[index].speaker || null;
      if (speaker === currentSpeaker) continue;
      flush(index - 1);
      startIndex = index;
      currentSpeaker = speaker;
    }
    flush(words.length - 1);

    return turns;
  }, [words]);

  const pollAIJob = useCallback(
    async <T,>(jobId: string, fallbackMessage: string, context: AIJobContext) => {
      for (;;) {
        await new Promise((resolve) => window.setTimeout(resolve, 700));
        const jobRes = await fetch(`${backendUrl}/jobs/${jobId}`);
        if (!jobRes.ok) throw new Error(`${fallbackMessage} status failed: ${jobRes.statusText}`);
        const job = (await jobRes.json()) as AIJob<T>;
        setActiveAIJob({ ...job, ...context });
        setProcessing(
          job.status === 'queued' || job.status === 'running' || job.status === 'canceling',
          job.message || fallbackMessage,
        );

        if (job.status === 'succeeded') {
          if (!job.result) throw new Error(`${fallbackMessage} finished without a result`);
          return job.result;
        }
        if (job.status === 'failed' || job.status === 'canceled') {
          throw new Error(job.error || job.message || `${fallbackMessage} ${job.status}`);
        }
      }
    },
    [backendUrl, setProcessing],
  );

  const startAIJob = useCallback(
    async <T,>(path: string, body: unknown, fallbackMessage: string, context?: Partial<AIJobContext>) => {
      const startRes = await fetch(`${backendUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!startRes.ok) {
        const errorData = await startRes.json().catch(() => null);
        throw new Error(errorData?.detail || `${fallbackMessage} start failed`);
      }

      const { job_id: jobId } = await startRes.json();
      const jobContext = { label: context?.label || fallbackMessage, draftId: context?.draftId };
      setActiveAIJob({
        id: jobId,
        kind: path.replace('/jobs/', ''),
        status: 'queued',
        progress: 0,
        message: 'Queued',
        logs: [],
        ...jobContext,
      });
      return pollAIJob<T>(jobId, fallbackMessage, jobContext);
    },
    [backendUrl, pollAIJob],
  );

  const createEditPlan = useCallback(async () => {
    const instruction = editPlanInstruction.trim();
    if (words.length === 0 || !instruction) return;
    setProcessing(true, 'Planning edits...');
    try {
      const config = providers[defaultProvider];
      const transcript = words.map((w) => w.word).join(' ');
      const data = await startAIJob<EditPlanResult>(
        '/jobs/ai/edit-plan',
        {
          instruction,
          transcript,
          words: words.map((w, i) => ({
            index: i,
            word: w.word,
            start: w.start,
            end: w.end,
          })),
          provider: defaultProvider,
          model: config.model,
          api_key: config.apiKey || undefined,
          base_url: config.baseUrl || undefined,
        },
        'Edit planning',
        { label: 'Edit planning' },
      );
      setEditPlanResult(data);
    } catch (err) {
      console.error(err);
      alert(`Edit planning failed.\n\n${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setProcessing(false);
    }
  }, [
    defaultProvider,
    editPlanInstruction,
    providers,
    setEditPlanResult,
    setProcessing,
    startAIJob,
    words,
  ]);

  const createDirectorPlan = useCallback(async () => {
    const instruction = editPlanInstruction.trim() || 'Create a fast, high-retention 60 second Short from the strongest moment.';
    if (words.length === 0) return;
    setProcessing(true, 'Directing short-form edit...');
    try {
      const config = providers[defaultProvider];
      const transcript = words.map((w) => w.word).join(' ');
      const data = await startAIJob<EditPlanResult>(
        '/jobs/ai/edit-plan',
        {
          instruction,
          transcript,
          words: words.map((w, i) => ({
            index: i,
            word: w.word,
            start: w.start,
            end: w.end,
          })),
          mode: 'director',
          platform: 'shorts',
          target_duration: 60,
          provider: defaultProvider,
          model: config.model,
          api_key: config.apiKey || undefined,
          base_url: config.baseUrl || undefined,
        },
        'AI Director',
        { label: 'AI Director' },
      );
      setEditPlanResult(data);
      if (data.directorClip) {
        setClipDrafts((current) => [
          ...current,
          {
            ...createShortsClipDraft(data.directorClip!, `director_clip_${Date.now()}_${current.length}`, 'draft'),
            hook: data.directorPackage?.hook || '',
            title: data.directorPackage?.title || data.directorClip!.title,
            description: data.directorPackage?.description || '',
            caption: data.directorPackage?.caption || '',
            hashtags: data.directorPackage?.hashtags || [],
            source: 'ai-director',
          },
        ]);
      }
    } catch (err) {
      console.error(err);
      alert(`AI Director failed.\n\n${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setProcessing(false);
    }
  }, [
    defaultProvider,
    editPlanInstruction,
    providers,
    setClipDrafts,
    setEditPlanResult,
    setProcessing,
    startAIJob,
    words,
  ]);

  const cancelAIJob = useCallback(async () => {
    if (!activeAIJob || !['queued', 'running'].includes(activeAIJob.status)) return;
    const res = await fetch(`${backendUrl}/jobs/${activeAIJob.id}/cancel`, { method: 'POST' });
    if (res.ok) {
      const job = (await res.json()) as AIJob<unknown>;
      setActiveAIJob({ ...job, label: activeAIJob.label, draftId: activeAIJob.draftId });
    }
    setProcessing(false);
  }, [activeAIJob, backendUrl, setProcessing]);

  const detectFillers = useCallback(async () => {
    if (words.length === 0) return;
    setProcessing(true, 'Detecting filler words...');
    try {
      const config = providers[defaultProvider];
      const transcript = words.map((w) => w.word).join(' ');
      const data = await startAIJob<FillerWordResult>(
        '/jobs/ai/filler-removal',
        {
          transcript,
          words: words.map((w, i) => ({ index: i, word: w.word })),
          provider: defaultProvider,
          model: config.model,
          api_key: config.apiKey || undefined,
          base_url: config.baseUrl || undefined,
          custom_filler_words: customFillerWords || undefined,
        },
        'Filler detection',
        { label: 'Filler detection' },
      );
      setFillerResult(data);
    } catch (err) {
      console.error(err);
      alert(`Filler detection failed.\n\n${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setProcessing(false);
    }
  }, [words, defaultProvider, providers, customFillerWords, setProcessing, setFillerResult, startAIJob]);

  const createClips = useCallback(async () => {
    if (words.length === 0) return;
    setProcessing(true, 'Finding best clip segments...');
    try {
      const config = providers[defaultProvider];
      const transcript = words.map((w) => w.word).join(' ');
      const data = await startAIJob<{ clips?: ClipSuggestion[] }>(
        '/jobs/ai/create-clip',
        {
          transcript,
          words: words.map((w, i) => ({
            index: i,
            word: w.word,
            start: w.start,
            end: w.end,
          })),
          provider: defaultProvider,
          model: config.model,
          api_key: config.apiKey || undefined,
          base_url: config.baseUrl || undefined,
          target_duration: 60,
          platform: 'shorts',
          min_duration: 30,
          max_duration: 90,
        },
        'Clip discovery',
        { label: 'Clip discovery' },
      );
      const clips = data.clips || [];
      setClipSuggestions(clips);
      setClipDrafts((current) => [
        ...current,
        ...clips.map((clip, index) => createShortsClipDraft(clip, `suggested_clip_${Date.now()}_${current.length}_${index}`, 'suggested')),
      ]);
    } catch (err) {
      console.error(err);
      alert(`Clip creation failed.\n\n${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setProcessing(false);
    }
  }, [words, defaultProvider, providers, setProcessing, setClipSuggestions, setClipDrafts, startAIJob]);

  const applyFillerDeletions = useCallback(() => {
    if (!fillerResult) return;
    const sorted = fillerResult.fillerWords
      .filter((fw) => fillerDecisions[fw.index] !== 'rejected' && !deletedWordMap.has(fw.index))
      .sort((a, b) => b.index - a.index);
    for (const fw of sorted) {
      deleteWordRange(fw.index, fw.index);
    }
    setFillerDecisions((current) => {
      const next = { ...current };
      for (const fw of sorted) next[fw.index] = 'accepted';
      return next;
    });
  }, [fillerResult, fillerDecisions, deletedWordMap, deleteWordRange, setFillerDecisions]);

  const acceptSafeFillerDeletions = useCallback(() => {
    if (!fillerResult) return;
    const sorted = fillerResult.fillerWords
      .filter(
        (fw) =>
          (fw.confidence ?? 0) >= 0.85 &&
          fillerDecisions[fw.index] !== 'rejected' &&
          !deletedWordMap.has(fw.index),
      )
      .sort((a, b) => b.index - a.index);
    for (const fw of sorted) {
      deleteWordRange(fw.index, fw.index);
    }
    setFillerDecisions((current) => {
      const next = { ...current };
      for (const fw of sorted) next[fw.index] = 'accepted';
      return next;
    });
  }, [deletedWordMap, deleteWordRange, fillerDecisions, fillerResult, setFillerDecisions]);

  const handlePreviewFiller = useCallback(
    (index: number) => {
      const word = words[index];
      if (!word) return;

      const previewStart = Math.max(0, word.start - 0.35);
      requestSeek(previewStart, 'backward', true);
    },
    [requestSeek, words],
  );

  const acceptFiller = useCallback(
    (index: number) => {
      if (!deletedWordMap.has(index)) {
        deleteWordRange(index, index);
      }
      setFillerDecisions((current) => ({ ...current, [index]: 'accepted' }));
    },
    [deletedWordMap, deleteWordRange, setFillerDecisions],
  );

  const rejectFiller = useCallback((index: number) => {
    setFillerDecisions((current) => ({ ...current, [index]: 'rejected' }));
  }, [setFillerDecisions]);

  const restoreAcceptedFiller = useCallback(
    (index: number) => {
      const rangeId = deletedWordMap.get(index);
      if (rangeId) restoreRange(rangeId);
      setFillerDecisions((current) => {
        const next = { ...current };
        delete next[index];
        return next;
      });
    },
    [deletedWordMap, restoreRange, setFillerDecisions],
  );

  const handlePreviewClip = useCallback(
    (clip: ClipSuggestion) => {
      const draftSettings = clip as Partial<ClipDraft>;
      if (draftSettings.id) {
        setActiveClipDraftId(draftSettings.id);
      }
      setSelectedWordIndices(getWordIndicesForClip(words, clip));
      if (isPreviewAspectRatio(draftSettings.aspectRatio)) {
        const aspectRatio = draftSettings.aspectRatio;
        setPreviewAspectRatio(aspectRatio);
        setExportOptions((current) => ({
          ...current,
          aspectRatio,
          reframe: draftSettings.reframe || current.reframe || { x: 50, y: 50 },
        }));
      }
      requestSeek(clip.startTime, 'forward', true);
    },
    [requestSeek, setExportOptions, setPreviewAspectRatio, setSelectedWordIndices, words],
  );

  const [exportingClipIndex, setExportingClipIndex] = useState<number | null>(null);
  const [exportingDraftId, setExportingDraftId] = useState<string | null>(null);
  const [clipExportJobs, setClipExportJobs] = useState<Record<string, ExportJob>>({});
  const [isBatchExporting, setBatchExporting] = useState(false);
  const [batchExportProgress, setBatchExportProgress] = useState({ completed: 0, total: 0, stopping: false });
  const stopBatchExportRef = useRef(false);
  const [packagingDraftId, setPackagingDraftId] = useState<string | null>(null);
  const exportableDraftCount = useMemo(
    () => clipDrafts.filter((draft) => EXPORTABLE_DRAFT_STATUSES.has(draft.status || 'draft')).length,
    [clipDrafts],
  );
  const readyDraftCount = useMemo(
    () =>
      clipDrafts.filter(
        (draft) =>
          EXPORTABLE_DRAFT_STATUSES.has(draft.status || 'draft') &&
          validateClipDraftForExport(draft, words, videoPath).ready,
      ).length,
    [clipDrafts, videoPath, words],
  );

  const updateClipDraft = useCallback((id: string, patch: Partial<ClipDraft>) => {
    setClipDrafts((current) =>
      current.map((draft) => {
        if (draft.id !== id) return draft;
        const normalizedPatch =
          patch.startTime !== undefined || patch.endTime !== undefined
            ? normalizeClipDraftRange(draft, patch, words)
            : patch;
        return { ...draft, ...normalizedPatch };
      }),
    );
  }, [setClipDrafts, words]);

  const approveClipDraft = useCallback((id: string) => {
    setActiveClipDraftId(id);
    updateClipDraft(id, { status: 'draft', lastError: undefined });
  }, [updateClipDraft]);

  const chooseClipExportDirectory = useCallback(async () => {
    if (window.electronAPI?.openDirectory) {
      const directory = await window.electronAPI.openDirectory({
        title: 'Choose clip export folder',
        defaultPath: clipExportDirectory || (videoPath ? getPathDirectory(videoPath) : undefined),
      });
      if (!directory) return;
      setClipExportDirectory(directory);
      setClipDrafts((current) => current.map((draft) => ({ ...draft, exportDirectory: directory })));
    }
  }, [clipExportDirectory, setClipDrafts, videoPath]);

  const duplicateClipDraft = useCallback(
    (draft: ClipDraft) => {
      setClipDrafts((current) => [
        ...current,
        {
          ...draft,
          id: `clip_copy_${Date.now()}_${current.length}`,
          title: `${draft.title} Copy`,
          status: 'draft',
          exportDirectory: draft.exportDirectory || clipExportDirectory || undefined,
          exportPath: undefined,
          exportedAt: undefined,
          lastError: undefined,
        },
      ]);
    },
    [clipExportDirectory, setClipDrafts],
  );

  const removeClipDraft = useCallback((id: string) => {
    setActiveClipDraftId((current) => (current === id ? null : current));
    setClipDrafts((current) => current.filter((draft) => draft.id !== id));
  }, [setClipDrafts]);

  const trimClipDraft = useCallback(
    (draft: ClipDraft, patch: Pick<Partial<ClipDraft>, 'startTime' | 'endTime'>) => {
      const normalizedPatch = normalizeClipDraftRange(draft, patch, words);
      const nextDraft = { ...draft, ...normalizedPatch };
      setActiveClipDraftId(draft.id);
      updateClipDraft(draft.id, normalizedPatch);
      setSelectedWordIndices(getWordIndicesForClip(words, nextDraft));
      requestSeek(nextDraft.startTime, 'forward', false);
    },
    [requestSeek, setSelectedWordIndices, updateClipDraft, words],
  );

  const pollClipExportJob = useCallback(
    async (jobId: string, draftId?: string) => {
      for (;;) {
        await new Promise((resolve) => window.setTimeout(resolve, 700));
        const res = await fetch(`${backendUrl}/jobs/${jobId}`);
        if (!res.ok) throw new Error(`Could not read clip export job: ${res.statusText}`);
        const job = (await res.json()) as ExportJob;
        if (draftId) {
          setClipExportJobs((current) => ({ ...current, [draftId]: job }));
        }

        if (job.status === 'succeeded') {
          return {
            outputPath: job.result?.output_path || '',
            srtPath: job.result?.srt_path,
          };
        }
        if (job.status === 'failed' || job.status === 'canceled') {
          throw new Error(job.error || job.message || `Clip export ${job.status}`);
        }
      }
    },
    [backendUrl],
  );

  const handleExportClip = useCallback(
    async (
      clip: ClipSuggestion,
      settings?: Pick<ClipDraft, 'format' | 'resolution' | 'aspectRatio' | 'reframe' | 'enhanceAudio' | 'captions' | 'captionStyle' | 'backgroundRemoval' | 'id' | 'exportDirectory'>,
      silent = false,
    ) => {
      if (!videoPath) return;
      try {
        const format = settings?.format ?? 'mp4';
        const aspectRatio = settings?.aspectRatio ?? 'source';
        const captions = settings?.captions ?? 'none';
        const outputDirectory = settings?.exportDirectory || clipExportDirectory || getPathDirectory(videoPath);
        const outputPath = buildClipOutputPath(outputDirectory, clip.title, format, settings?.id);
        const clipWords = buildClipCaptionWords(words, clip.startWordIndex, clip.endWordIndex, clip.startTime);
        const captionHidden = new Set(getCaptionHiddenIndices());
        const deletedSet = new Set<number>();
        for (const range of deletedRanges) {
          for (const index of range.wordIndices) deletedSet.add(index);
        }
        const deletedClipIndices = clipWords
          .map((_, localIndex) => clip.startWordIndex + localIndex)
          .map((globalIndex, localIndex) => (deletedSet.has(globalIndex) || captionHidden.has(globalIndex) ? localIndex : -1))
          .filter((index) => index >= 0);

        const res = await fetch(`${backendUrl}/jobs/export`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input_path: videoPath,
            output_path: outputPath,
            keep_segments: [{ start: clip.startTime, end: clip.endTime }],
            mode: aspectRatio === 'source' && format === 'mp4' && captions !== 'burn-in' ? 'fast' : 'reencode',
            resolution: settings?.resolution ?? '1080p',
            aspectRatio,
            reframe: settings?.reframe,
            format,
            enhanceAudio: !!settings?.enhanceAudio,
            captions,
            captionStyle: captions === 'burn-in' ? settings?.captionStyle : undefined,
            words: captions !== 'none' ? clipWords : undefined,
            deleted_indices: captions !== 'none' ? deletedClipIndices : undefined,
            muted_ranges: getMutedRanges(),
            backgroundRemoval: settings?.backgroundRemoval?.enabled ? settings.backgroundRemoval : undefined,
          }),
        });
        if (!res.ok) throw new Error('Export start failed');
        const { job_id: jobId } = await res.json();
        if (settings?.id) {
          updateClipDraft(settings.id, { status: 'exporting', lastError: undefined });
          setClipExportJobs((current) => ({
            ...current,
            [settings.id!]: {
              id: jobId,
              status: 'queued',
              progress: 0,
              message: 'Queued',
              logs: [],
            },
          }));
        }
        const output = await pollClipExportJob(jobId, settings?.id);
        if (settings?.id) {
          updateClipDraft(settings.id, {
            status: 'exported',
            exportPath: output.outputPath,
            exportedAt: new Date().toISOString(),
            lastError: undefined,
          });
        }
        if (!silent) {
          alert(
            output.srtPath
              ? `Clip exported to: ${output.outputPath}\nCaptions saved to: ${output.srtPath}`
              : `Clip exported to: ${output.outputPath}`,
          );
        }
        return output.outputPath;
      } catch (err) {
        console.error(err);
        const message = err instanceof Error ? err.message : String(err);
        if (settings?.id) {
          updateClipDraft(settings.id, { status: 'failed', lastError: message });
        }
        if (!silent && !message.toLowerCase().includes('canceled')) {
          alert('Failed to export clip. Check console for details.');
        }
        throw err;
      } finally {
        setExportingClipIndex(null);
      }
    },
    [videoPath, clipExportDirectory, words, getCaptionHiddenIndices, deletedRanges, backendUrl, getMutedRanges, pollClipExportJob, updateClipDraft],
  );

  const cancelDraftExport = useCallback(
    async (draftId: string) => {
      const job = clipExportJobs[draftId];
      if (!job || !['queued', 'running'].includes(job.status)) return;
      const res = await fetch(`${backendUrl}/jobs/${job.id}/cancel`, { method: 'POST' });
      if (res.ok) {
        const canceledJob = (await res.json()) as ExportJob;
        setClipExportJobs((current) => ({ ...current, [draftId]: canceledJob }));
        updateClipDraft(draftId, { status: 'failed', lastError: canceledJob.error || canceledJob.message || 'Export canceled' });
      }
      setExportingDraftId((current) => (current === draftId ? null : current));
    },
    [backendUrl, clipExportJobs, updateClipDraft],
  );

  const retryDraftExport = useCallback(
    async (draft: ClipDraft) => {
      const job = clipExportJobs[draft.id];
      if (!job || !['failed', 'canceled'].includes(job.status)) return;
      setExportingDraftId(draft.id);
      try {
        const res = await fetch(`${backendUrl}/jobs/${job.id}/retry`, { method: 'POST' });
        if (!res.ok) throw new Error(`Retry failed: ${res.statusText}`);
        const { job_id: jobId } = await res.json();
        setClipExportJobs((current) => ({
          ...current,
          [draft.id]: {
            id: jobId,
            status: 'queued',
            progress: 0,
            message: 'Retry queued',
            logs: [],
          },
        }));
        updateClipDraft(draft.id, { status: 'exporting', lastError: undefined });
        const output = await pollClipExportJob(jobId, draft.id);
        updateClipDraft(draft.id, {
          status: 'exported',
          exportPath: output.outputPath,
          exportedAt: new Date().toISOString(),
          lastError: undefined,
        });
        alert(
          output.srtPath
            ? `Clip exported to: ${output.outputPath}\nCaptions saved to: ${output.srtPath}`
            : `Clip exported to: ${output.outputPath}`,
        );
      } catch (err) {
        console.error(err);
        updateClipDraft(draft.id, { status: 'failed', lastError: err instanceof Error ? err.message : String(err) });
        alert(`Clip retry failed.\n\n${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setExportingDraftId(null);
      }
    },
    [backendUrl, clipExportJobs, pollClipExportJob, updateClipDraft],
  );

  const handleExportSuggestedClip = useCallback(
    async (clip: ClipSuggestion, index: number) => {
      setExportingClipIndex(index);
      try {
        await handleExportClip(clip);
      } finally {
        setExportingClipIndex(null);
      }
    },
    [handleExportClip],
  );

  const createClipDraft = useCallback(
    (clip: ClipSuggestion, source: ClipDraft['source'] = 'ai', speaker?: string) => {
      setClipDrafts((current) => [
        ...current,
        {
          ...createShortsClipDraft(clip, `clip_${Date.now()}_${current.length}`, 'draft', source, speaker),
          exportDirectory: clipExportDirectory || undefined,
        },
      ]);
    },
    [clipExportDirectory, setClipDrafts],
  );

  const createSpeakerTurnDrafts = useCallback(() => {
    if (speakerTurnClips.length === 0) return;
    setClipDrafts((current) => [
      ...current,
      ...speakerTurnClips.map((clip, index) => {
        const speaker = words[clip.startWordIndex]?.speaker || 'Unknown speaker';
        return {
          ...createShortsClipDraft(clip, `speaker_clip_${Date.now()}_${current.length}_${index}`, 'draft', 'speaker-turn', speaker),
          exportDirectory: clipExportDirectory || undefined,
        };
      }),
    ]);
  }, [clipExportDirectory, setClipDrafts, speakerTurnClips, words]);

  const copyClipPackage = useCallback(
    async (draft: ClipDraft) => {
      const packageText = formatClipPackage(
        draft,
        words.slice(draft.startWordIndex, draft.endWordIndex + 1),
      );
      try {
        await navigator.clipboard.writeText(packageText);
        alert('Clip package copied.');
      } catch (err) {
        console.error('Clip package copy failed:', err);
        alert(`Could not copy clip package.\n\n${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [words],
  );

  const copySocialPackage = useCallback(
    async (draft: ClipDraft, platform?: SocialPlatform) => {
      const pack = buildSocialPublishingPack(draft);
      const packageText = platform
        ? pack.find((item) => item.platform === platform)?.text || ''
        : pack.map((item) => item.text).join('\n\n');
      try {
        await navigator.clipboard.writeText(packageText);
        alert(platform ? 'Social post copied.' : 'Social publishing pack copied.');
      } catch (err) {
        console.error('Social publishing copy failed:', err);
        alert(`Could not copy social package.\n\n${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [],
  );

  const copyHookFrameBrief = useCallback(async (draft: ClipDraft, frame?: HookFrameCandidate) => {
    try {
      await navigator.clipboard.writeText(formatHookFrameBrief(draft, frame));
      alert('Hook frame brief copied.');
    } catch (err) {
      console.error('Hook frame copy failed:', err);
      alert(`Could not copy hook frame brief.\n\n${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  const previewHookFrame = useCallback(
    (time: number) => {
      requestSeek(time, 'forward', false);
    },
    [requestSeek],
  );

  const handleExportDraft = useCallback(
    async (draft: ClipDraft) => {
      const validation = validateClipDraftForExport(draft, words, videoPath);
      if (!validation.ready) {
        alert(`Clip is not ready to export.\n\n${validation.reasons.join('\n')}`);
        return;
      }
      setExportingDraftId(draft.id);
      try {
        await handleExportClip(draft, draft);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!message.toLowerCase().includes('canceled')) {
          console.error(err);
        }
      } finally {
        setExportingDraftId(null);
      }
    },
    [handleExportClip, videoPath, words],
  );

  const handleExportAllDrafts = useCallback(async () => {
    const exportableDrafts = clipDrafts.filter(
      (draft) =>
        EXPORTABLE_DRAFT_STATUSES.has(draft.status || 'draft') &&
        validateClipDraftForExport(draft, words, videoPath).ready,
    );
    if (exportableDrafts.length === 0) return;
    stopBatchExportRef.current = false;
    setBatchExporting(true);
    setBatchExportProgress({ completed: 0, total: exportableDrafts.length, stopping: false });
    const results: BatchExportResult[] = [];
    try {
      for (let index = 0; index < exportableDrafts.length; index++) {
        if (stopBatchExportRef.current) break;
        const draft = exportableDrafts[index];
        setExportingDraftId(draft.id);
        setClipExportJobs((current) => {
          const next = { ...current };
          delete next[draft.id];
          return next;
        });
        try {
          const outputPath = await handleExportClip(draft, draft, true);
          results.push({ draft, outputPath });
        } catch (err) {
          results.push({ draft, error: err instanceof Error ? err.message : String(err) });
        }
        setBatchExportProgress((current) => ({ ...current, completed: index + 1 }));
      }
      const successCount = results.filter((result) => result.outputPath).length;
      const failedCount = results.filter((result) => result.error).length;
      const manifestPath = await writeClipBatchManifest({
        directory: clipExportDirectory || (videoPath ? getPathDirectory(videoPath) : ''),
        videoPath,
        results,
        words,
      });
      alert(
        stopBatchExportRef.current
          ? `Stopped batch export after ${results.length} of ${exportableDrafts.length} clips.\n${successCount} exported, ${failedCount} failed.${manifestPath ? `\nManifest saved to: ${manifestPath}` : ''}`
          : `Batch export finished.\n${successCount} exported, ${failedCount} failed.${manifestPath ? `\nManifest saved to: ${manifestPath}` : ''}`,
      );
    } catch (err) {
      console.error(err);
      alert(`Batch export failed.\n\n${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExportingDraftId(null);
      setBatchExporting(false);
      stopBatchExportRef.current = false;
      setBatchExportProgress((current) => ({ ...current, stopping: false }));
    }
  }, [clipDrafts, clipExportDirectory, handleExportClip, videoPath, words]);

  const stopBatchExport = useCallback(() => {
    stopBatchExportRef.current = true;
    setBatchExportProgress((current) => ({ ...current, stopping: true }));
  }, []);

  const packageClipDraft = useCallback(
    async (draft: ClipDraft) => {
      setPackagingDraftId(draft.id);
      try {
        const config = providers[defaultProvider];
        const transcript = words
          .slice(draft.startWordIndex, draft.endWordIndex + 1)
          .map((word) => word.word)
          .join(' ');
        if (!transcript.trim()) throw new Error('This draft has no transcript text to package.');
        const data = await startAIJob<ClipMetadataResult>(
          '/jobs/ai/clip-metadata',
          {
            transcript,
            provider: defaultProvider,
            model: config.model,
            api_key: config.apiKey || undefined,
            base_url: config.baseUrl || undefined,
          },
          'Clip packaging',
          { label: 'Clip packaging', draftId: draft.id },
        );
        updateClipDraft(draft.id, {
          hook: data.hook || '',
          title: data.titles?.[0] || draft.title,
          description: data.description || '',
          caption: data.caption || '',
          hashtags: data.hashtags || [],
          status: 'packaged',
          lastError: undefined,
        });
      } catch (err) {
        console.error(err);
        updateClipDraft(draft.id, { lastError: err instanceof Error ? err.message : String(err) });
        alert(`Clip packaging failed.\n\n${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setPackagingDraftId(null);
      }
    },
    [defaultProvider, providers, startAIJob, updateClipDraft, words],
  );

  const retryAIJob = useCallback(async () => {
    if (!activeAIJob || !['failed', 'canceled'].includes(activeAIJob.status)) return;
    setProcessing(true, `Retrying ${activeAIJob.label}...`);
    try {
      const retryRes = await fetch(`${backendUrl}/jobs/${activeAIJob.id}/retry`, { method: 'POST' });
      if (!retryRes.ok) throw new Error(`Retry failed: ${retryRes.statusText}`);
      const { job_id: jobId } = await retryRes.json();
      const context = { label: activeAIJob.label, draftId: activeAIJob.draftId };
      const result = await pollAIJob<unknown>(jobId, activeAIJob.label, context);

      if (activeAIJob.kind === 'ai:filler-removal') {
        setFillerResult(result as FillerWordResult);
      } else if (activeAIJob.kind === 'ai:create-clip') {
        const clipResult = result as { clips?: ClipSuggestion[] };
        const clips = clipResult.clips || [];
        setClipSuggestions(clips);
        setClipDrafts((current) => [
          ...current,
          ...clips.map((clip, index) => createShortsClipDraft(clip, `suggested_clip_retry_${Date.now()}_${current.length}_${index}`, 'suggested')),
        ]);
      } else if (activeAIJob.kind === 'ai:edit-plan') {
        setEditPlanResult(result as EditPlanResult);
      } else if (activeAIJob.kind === 'ai:clip-metadata' && activeAIJob.draftId) {
        const metadata = result as ClipMetadataResult;
        const patch: Partial<ClipDraft> = {
          hook: metadata.hook || '',
          description: metadata.description || '',
          caption: metadata.caption || '',
          hashtags: metadata.hashtags || [],
        };
        if (metadata.titles?.[0]) patch.title = metadata.titles[0];
        patch.status = 'packaged';
        patch.lastError = undefined;
        updateClipDraft(activeAIJob.draftId, patch);
      }
    } catch (err) {
      console.error(err);
      alert(`AI retry failed.\n\n${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setProcessing(false);
    }
  }, [
    activeAIJob,
    backendUrl,
    pollAIJob,
    setClipDrafts,
    setClipSuggestions,
    setEditPlanResult,
    setFillerResult,
    setProcessing,
    updateClipDraft,
  ]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-editor-border shrink-0">
        <TabButton
          active={activeTab === 'edit'}
          onClick={() => setActiveTab('edit')}
          icon={<Sparkles className="w-3.5 h-3.5" />}
          label="AI Editor"
        />
        <TabButton
          active={activeTab === 'filler'}
          onClick={() => setActiveTab('filler')}
          icon={<Scissors className="w-3.5 h-3.5" />}
          label="Filler Words"
        />
        <TabButton
          active={activeTab === 'clips'}
          onClick={() => setActiveTab('clips')}
          icon={<Film className="w-3.5 h-3.5" />}
          label="Create Clips"
        />
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {activeAIJob && (
          <AIJobStatusCard job={activeAIJob} onCancel={cancelAIJob} onRetry={retryAIJob} />
        )}

        {activeTab === 'edit' && (
          <div className="space-y-4">
            <p className="text-xs text-editor-text-muted">
              Ask for transcript edits, review each proposed cut, then apply only the changes you want.
            </p>
            <div className="space-y-1.5">
              <label className="text-[11px] text-editor-text-muted font-medium">
                Edit instruction
              </label>
              <textarea
                value={editPlanInstruction}
                onChange={(event) => setEditPlanInstruction(event.target.value)}
                rows={3}
                placeholder="Make this tighter, remove repeated starts, and cut awkward pauses."
                className="w-full resize-none rounded border border-editor-border bg-editor-surface px-2.5 py-2 text-xs text-editor-text placeholder:text-editor-text-muted/50 focus:border-editor-accent focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={createEditPlan}
                disabled={isProcessing || words.length === 0 || !editPlanInstruction.trim()}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-editor-accent hover:bg-editor-accent-hover disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {processingMessage}
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Plan Edits
                  </>
                )}
              </button>
              <button
                onClick={createDirectorPlan}
                disabled={isProcessing || words.length === 0}
                className="flex items-center justify-center gap-2 rounded-lg bg-editor-success/20 px-4 py-2.5 text-sm font-medium text-editor-success transition-colors hover:bg-editor-success/30 disabled:opacity-50"
              >
                {isProcessing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Film className="w-4 h-4" />
                )}
                AI Director
              </button>
            </div>

            {editPlanResult && (
              <div className="space-y-3">
                <div className="space-y-1 rounded bg-editor-surface px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium">
                      {editPlanReviewedCount}/{editPlanResult.suggestions.length} reviewed
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={applyPendingEditSuggestions}
                        disabled={pendingEditSuggestions.length === 0}
                        className="flex items-center gap-1 rounded bg-editor-success/20 px-2 py-1 text-[10px] text-editor-success hover:bg-editor-success/30 disabled:opacity-40"
                      >
                        <Check className="w-3 h-3" />
                        Apply Pending
                      </button>
                      <button
                        onClick={() => setEditPlanResult(null)}
                        className="flex items-center gap-1 rounded bg-editor-border px-2 py-1 text-[10px] text-editor-text-muted hover:bg-editor-panel"
                      >
                        <X className="w-3 h-3" />
                        Dismiss
                      </button>
                    </div>
                  </div>
                  {editPlanResult.summary && (
                    <p className="text-[11px] leading-snug text-editor-text-muted">
                      {editPlanResult.summary}
                    </p>
                  )}
                  {editPlanResult.directorClip && (
                    <div className="rounded border border-editor-border bg-editor-bg px-2 py-1.5 text-[11px] text-editor-text-muted">
                      <div className="font-medium text-editor-text">
                        Director clip: {editPlanResult.directorPackage?.title || editPlanResult.directorClip.title}
                      </div>
                      <div>
                        {formatClipTime(editPlanResult.directorClip.startTime)} - {formatClipTime(editPlanResult.directorClip.endTime)}
                        {' '}({Math.round(editPlanResult.directorClip.endTime - editPlanResult.directorClip.startTime)}s)
                      </div>
                      {editPlanResult.directorPackage?.hook && (
                        <div>Hook: {editPlanResult.directorPackage.hook}</div>
                      )}
                    </div>
                  )}
                  {editPlanResult.directorNotes && editPlanResult.directorNotes.length > 0 && (
                    <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-editor-text-muted">
                      {editPlanResult.directorNotes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  )}
                </div>

                {editPlanResult.suggestions.length > 0 ? (
                  <div className="space-y-2 max-h-[32rem] overflow-y-auto pr-1">
                    {editPlanResult.suggestions.map((suggestion) => (
                      <EditPlanReviewItem
                        key={suggestion.id}
                        suggestion={suggestion}
                        decision={editPlanDecisions[suggestion.id]}
                        alreadyCut={isEditSuggestionAlreadyCut(suggestion, deletedWordMap)}
                        onPreview={() => previewEditSuggestion(suggestion)}
                        onAccept={() => acceptEditSuggestion(suggestion)}
                        onReject={() => rejectEditSuggestion(suggestion.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="rounded bg-editor-surface px-3 py-2 text-xs text-editor-text-muted">
                    No safe edit suggestions were found for this instruction.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'filler' && (
          <div className="space-y-4">
            <p className="text-xs text-editor-text-muted">
              Use AI to detect and remove filler words like "um", "uh", "like", "you know" from
              your transcript.
            </p>
            <div className="space-y-1.5">
              <label className="text-[11px] text-editor-text-muted font-medium">
                Custom filler words (comma-separated)
              </label>
              <input
                type="text"
                value={customFillerWords}
                onChange={(e) => setCustomFillerWords(e.target.value)}
                placeholder="e.g. okay, alright, anyway"
                className="w-full px-2.5 py-1.5 text-xs bg-editor-surface border border-editor-border rounded focus:border-editor-accent focus:outline-none"
              />
            </div>
            <button
              onClick={detectFillers}
              disabled={isProcessing || words.length === 0}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-editor-accent hover:bg-editor-accent-hover disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {processingMessage}
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Detect Filler Words
                </>
              )}
            </button>

            {fillerResult && fillerResult.fillerWords.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium truncate">
                    {reviewedCount}/{fillerResult.fillerWords.length} reviewed
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={acceptSafeFillerDeletions}
                      disabled={safeFillerCount === 0}
                      className="flex items-center gap-1 px-2 py-1 text-xs bg-editor-accent/20 text-editor-accent rounded hover:bg-editor-accent/30 disabled:opacity-40"
                    >
                      <Check className="w-3 h-3" /> Accept Safe
                    </button>
                    <button
                      onClick={acceptVisibleFillerDeletions}
                      disabled={visibleFillerWords.every((fw) => fillerDecisions[fw.index] === 'rejected' || deletedWordMap.has(fw.index))}
                      className="flex items-center gap-1 px-2 py-1 text-xs bg-editor-success/20 text-editor-success rounded hover:bg-editor-success/30 disabled:opacity-40"
                    >
                      <Check className="w-3 h-3" /> Accept Visible
                    </button>
                    <button
                      onClick={applyFillerDeletions}
                      className="flex items-center gap-1 px-2 py-1 text-xs bg-editor-success/20 text-editor-success rounded hover:bg-editor-success/30"
                    >
                      <Check className="w-3 h-3" /> Accept Rest
                    </button>
                    <button
                      onClick={() => setFillerResult(null)}
                      className="flex items-center gap-1 px-2 py-1 text-xs bg-editor-border text-editor-text-muted rounded hover:bg-editor-surface"
                    >
                      <X className="w-3 h-3" /> Dismiss
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 rounded bg-editor-surface px-2.5 py-2">
                  <label className="space-y-1 text-[11px] text-editor-text-muted">
                    <span className="flex items-center gap-1">
                      <Filter className="w-3 h-3" /> Confidence
                    </span>
                    <select
                      value={fillerQueueFilter}
                      onChange={(event) => setFillerQueueFilter(event.target.value as FillerQueueFilter)}
                      className="w-full rounded border border-editor-border bg-editor-panel px-2 py-1 text-xs text-editor-text focus:border-editor-accent focus:outline-none"
                    >
                      <option value="all">All suggestions</option>
                      <option value="unreviewed">Unreviewed</option>
                      <option value="safe">Safe only</option>
                      <option value="review">Needs review</option>
                      <option value="low">Low confidence</option>
                      <option value="accepted">Accepted</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </label>
                  <label className="space-y-1 text-[11px] text-editor-text-muted">
                    <span>Reason</span>
                    <select
                      value={fillerReasonFilter}
                      onChange={(event) => setFillerReasonFilter(event.target.value)}
                      className="w-full rounded border border-editor-border bg-editor-panel px-2 py-1 text-xs text-editor-text focus:border-editor-accent focus:outline-none"
                    >
                      <option value="all">All reasons</option>
                      {fillerReasonBuckets.map(([bucket, count]) => (
                        <option key={bucket} value={bucket}>
                          {bucket} ({count})
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="col-span-2 text-[11px] text-editor-text-muted">
                    Showing {visibleFillerWords.length} of {fillerResult.fillerWords.length} suggestions
                  </div>
                </div>
                <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
                  {visibleFillerWords.map((fw) => (
                    <FillerReviewItem
                      key={fw.index}
                      word={fw.word}
                      reason={fw.reason}
                      confidence={fw.confidence}
                      decision={fillerDecisions[fw.index]}
                      alreadyCut={deletedWordMap.has(fw.index) && !fillerDecisions[fw.index]}
                      onPreview={() => handlePreviewFiller(fw.index)}
                      onAccept={() => acceptFiller(fw.index)}
                      onReject={() => rejectFiller(fw.index)}
                      onRestore={() => restoreAcceptedFiller(fw.index)}
                    />
                  ))}
                  {visibleFillerWords.length === 0 && (
                    <p className="rounded bg-editor-surface px-3 py-2 text-xs text-editor-text-muted">
                      No suggestions match these filters.
                    </p>
                  )}
                </div>
              </div>
            )}

            {fillerResult && fillerResult.fillerWords.length === 0 && (
              <p className="text-xs text-editor-success">No filler words detected.</p>
            )}
          </div>
        )}

        {activeTab === 'clips' && (
          <div className="space-y-4">
            <p className="text-xs text-editor-text-muted">
              AI analyzes your transcript and suggests the most engaging segments for a
              YouTube Short or social media clip.
            </p>
            <button
              onClick={createClips}
              disabled={isProcessing || words.length === 0}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-editor-accent hover:bg-editor-accent-hover disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {processingMessage}
                </>
              ) : (
                <>
                  <Film className="w-4 h-4" />
                  Find Best Clips
                </>
              )}
            </button>

            {speakerTurnClips.length > 0 && (
              <button
                onClick={createSpeakerTurnDrafts}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-editor-border text-editor-text-muted hover:bg-editor-surface rounded-lg text-sm font-medium transition-colors"
              >
                <Users className="w-4 h-4" />
                Draft {speakerTurnClips.length} Speaker Turns
              </button>
            )}

            {clipDrafts.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Clip Drafts</span>
                  <div className="flex items-center gap-1">
                    {isBatchExporting && (
                      <button
                        onClick={stopBatchExport}
                        className="flex items-center gap-1 rounded bg-editor-border px-2 py-1 text-[10px] text-editor-text-muted hover:bg-editor-surface"
                      >
                        <X className="w-3 h-3" />
                        {batchExportProgress.stopping ? 'Stopping' : 'Stop'}
                      </button>
                    )}
                    <button
                      onClick={handleExportAllDrafts}
                      disabled={isBatchExporting || readyDraftCount === 0}
                      className="flex items-center gap-1 rounded bg-editor-success/20 px-2 py-1 text-[10px] text-editor-success hover:bg-editor-success/30 disabled:opacity-50"
                    >
                      {isBatchExporting ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Download className="w-3 h-3" />
                      )}
                      Export Approved
                    </button>
                  </div>
                </div>
                <div className="text-[10px] text-editor-text-muted">
                  {readyDraftCount} ready, {exportableDraftCount} approved/exportable of {clipDrafts.length} drafts
                </div>
                <div className="space-y-1 rounded bg-editor-surface p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-editor-text-muted">
                      Export folder
                    </span>
                    {window.electronAPI?.openDirectory && (
                      <button
                        onClick={chooseClipExportDirectory}
                        className="rounded bg-editor-border px-2 py-1 text-[10px] text-editor-text-muted hover:bg-editor-bg"
                      >
                        Choose
                      </button>
                    )}
                  </div>
                  <input
                    value={clipExportDirectory}
                    onChange={(event) => {
                      const directory = event.target.value;
                      setClipExportDirectory(directory);
                      setClipDrafts((current) => current.map((draft) => ({ ...draft, exportDirectory: directory || undefined })));
                    }}
                    placeholder={videoPath ? getPathDirectory(videoPath) : 'Default export folder'}
                    className="w-full rounded border border-editor-border bg-editor-bg px-2 py-1.5 text-[11px] text-editor-text focus:border-editor-accent focus:outline-none"
                  />
                </div>
                {isBatchExporting && (
                  <div className="space-y-1 rounded bg-editor-surface px-2.5 py-2 text-[11px] text-editor-text-muted">
                    <div className="flex justify-between gap-2">
                      <span>
                        Exporting {batchExportProgress.completed + 1 > batchExportProgress.total ? batchExportProgress.total : batchExportProgress.completed + 1} of {batchExportProgress.total}
                      </span>
                      <span>{batchExportProgress.stopping ? 'Stopping after current clip' : `${batchExportProgress.completed}/${batchExportProgress.total} done`}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded bg-editor-border">
                      <div
                        className="h-full bg-editor-success"
                        style={{
                          width: `${Math.max(
                            4,
                            Math.min(
                              100,
                              batchExportProgress.total
                                ? (batchExportProgress.completed / batchExportProgress.total) * 100
                                : 0,
                            ),
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  {clipDrafts.map((draft) => (
                    <ClipDraftCard
                      key={draft.id}
                      draft={draft}
                      isExporting={exportingDraftId === draft.id}
                      exportJob={clipExportJobs[draft.id]}
                      backgroundCapabilities={backgroundCapabilities}
                      transcriptSnippet={getClipTranscript(words, draft)}
                      clipWords={words.slice(draft.startWordIndex, draft.endWordIndex + 1)}
                      activeWordIndex={activeWordIndex}
                      isActive={activeClipDraftId === draft.id}
                      exportValidation={validateClipDraftForExport(draft, words, videoPath)}
                      onChange={(patch) => updateClipDraft(draft.id, patch)}
                      onTrim={(patch) => trimClipDraft(draft, patch)}
                      onApprove={() => approveClipDraft(draft.id)}
                      onPreview={() => handlePreviewClip(draft)}
                      onExport={() => handleExportDraft(draft)}
                      onCancelExport={() => cancelDraftExport(draft.id)}
                      onRetryExport={() => retryDraftExport(draft)}
                      onPackage={() => packageClipDraft(draft)}
                      onCopyPackage={() => copyClipPackage(draft)}
                      onCopySocialPackage={(platform) => copySocialPackage(draft, platform)}
                      onPreviewHookFrame={(time) => previewHookFrame(time)}
                      onCopyHookFrame={(frame) => copyHookFrameBrief(draft, frame)}
                      onDuplicate={() => duplicateClipDraft(draft)}
                      onRemove={() => removeClipDraft(draft.id)}
                      isPackaging={packagingDraftId === draft.id}
                    />
                  ))}
                </div>
              </div>
            )}

            {clipSuggestions.length > 0 && (
              <div className="space-y-3">
                <span className="text-xs font-medium">Suggestions</span>
                {clipSuggestions.map((clip, i) => (
                  <div key={i} className="p-3 bg-editor-surface rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold">{clip.title}</span>
                      <span className="text-[10px] text-editor-text-muted">
                        {Math.round(clip.endTime - clip.startTime)}s
                      </span>
                    </div>
                    <p className="text-[11px] text-editor-text-muted">{clip.reason}</p>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => handlePreviewClip(clip)}
                        className="flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-editor-accent/20 text-editor-accent rounded hover:bg-editor-accent/30 transition-colors"
                      >
                        <Play className="w-3 h-3" /> Preview
                      </button>
                      <button
                        onClick={() => createClipDraft(clip)}
                        className="flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-editor-border text-editor-text-muted rounded hover:bg-editor-surface transition-colors"
                      >
                        <Plus className="w-3 h-3" /> Draft
                      </button>
                      <button
                        onClick={() => handleExportSuggestedClip(clip, i)}
                        disabled={exportingClipIndex === i}
                        className="flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-editor-success/20 text-editor-success rounded hover:bg-editor-success/30 disabled:opacity-50 transition-colors"
                      >
                        {exportingClipIndex === i ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Download className="w-3 h-3" />
                        )}
                        Export
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function EditPlanReviewItem({
  suggestion,
  decision,
  alreadyCut,
  onPreview,
  onAccept,
  onReject,
}: {
  suggestion: EditPlanSuggestion;
  decision?: EditPlanReviewDecision;
  alreadyCut: boolean;
  onPreview: () => void;
  onAccept: () => void;
  onReject: () => void;
}) {
  const confidence = suggestion.confidence ?? 0;
  const confidenceLabel = confidence >= 0.85 ? 'Safe' : confidence >= 0.6 ? 'Review' : 'Low';
  const wordCount = suggestion.endWordIndex - suggestion.startWordIndex + 1;

  return (
    <div className="space-y-2 rounded bg-editor-surface px-3 py-2 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1 text-[10px] text-editor-text-muted">
            <span>{formatClipTime(suggestion.startTime)} - {formatClipTime(suggestion.endTime)}</span>
            <span>&middot;</span>
            <span>{wordCount} word{wordCount === 1 ? '' : 's'}</span>
            <span
              className={`rounded px-1.5 py-0.5 ${
                confidence >= 0.85
                  ? 'bg-editor-success/20 text-editor-success'
                  : confidence >= 0.6
                    ? 'bg-editor-accent/15 text-editor-accent'
                    : 'bg-editor-warning/10 text-editor-warning'
              }`}
            >
              {confidenceLabel} {Math.round(confidence * 100)}%
            </span>
          </div>
          <div className="line-clamp-3 text-editor-text">"{suggestion.text}"</div>
          <div className="text-[11px] leading-snug text-editor-text-muted">{suggestion.reason}</div>
        </div>
        {(decision || alreadyCut) && (
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${
              decision === 'accepted' || alreadyCut
                ? 'bg-editor-success/20 text-editor-success'
                : 'bg-editor-border text-editor-text-muted'
            }`}
          >
            {alreadyCut ? 'Applied' : decision === 'accepted' ? 'Accepted' : 'Rejected'}
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-1">
        <button
          onClick={onPreview}
          className="flex items-center justify-center gap-1 rounded bg-editor-accent/20 px-2 py-1 text-[11px] text-editor-accent hover:bg-editor-accent/30"
        >
          <Play className="w-3 h-3" /> Preview
        </button>
        <button
          onClick={onAccept}
          disabled={decision === 'rejected' || alreadyCut}
          className="flex items-center justify-center gap-1 rounded bg-editor-success/20 px-2 py-1 text-[11px] text-editor-success hover:bg-editor-success/30 disabled:opacity-40"
        >
          <Check className="w-3 h-3" /> Accept
        </button>
        <button
          onClick={onReject}
          disabled={decision === 'accepted' || alreadyCut}
          className="flex items-center justify-center gap-1 rounded bg-editor-border px-2 py-1 text-[11px] text-editor-text-muted hover:bg-editor-panel disabled:opacity-40"
        >
          <X className="w-3 h-3" /> Reject
        </button>
      </div>
    </div>
  );
}

function ClipDraftCard({
  draft,
  isExporting,
  isPackaging,
  exportJob,
  backgroundCapabilities,
  transcriptSnippet,
  clipWords,
  activeWordIndex,
  isActive,
  exportValidation,
  onChange,
  onTrim,
  onApprove,
  onPreview,
  onExport,
  onCancelExport,
  onRetryExport,
  onPackage,
  onCopyPackage,
  onCopySocialPackage,
  onPreviewHookFrame,
  onCopyHookFrame,
  onDuplicate,
  onRemove,
}: {
  draft: ClipDraft;
  isExporting: boolean;
  isPackaging: boolean;
  exportJob?: ExportJob;
  backgroundCapabilities: BackgroundCapabilities | null;
  transcriptSnippet: string;
  clipWords: Word[];
  activeWordIndex: number;
  isActive: boolean;
  exportValidation: ReturnType<typeof validateClipDraftForExport>;
  onChange: (patch: Partial<ClipDraft>) => void;
  onTrim: (patch: Pick<Partial<ClipDraft>, 'startTime' | 'endTime'>) => void;
  onApprove: () => void;
  onPreview: () => void;
  onExport: () => void;
  onCancelExport: () => void;
  onRetryExport: () => void;
  onPackage: () => void;
  onCopyPackage: () => void;
  onCopySocialPackage: (platform?: SocialPlatform) => void;
  onPreviewHookFrame: (time: number) => void;
  onCopyHookFrame: (frame?: HookFrameCandidate) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const exportActive = exportJob?.status === 'queued' || exportJob?.status === 'running' || exportJob?.status === 'canceling';
  const exportRetryable = exportJob?.status === 'failed' || exportJob?.status === 'canceled';
  const status = draft.status || 'draft';
  const isSuggested = status === 'suggested';
  const canExport = exportValidation.ready && !isSuggested;
  const socialPack = buildSocialPublishingPack(draft);
  const hookFrames = buildHookFrameCandidates(draft);
  const selectedHookFrame = getSelectedHookFrame(draft);

  return (
    <div className={`space-y-2 rounded border p-3 ${isActive ? 'border-editor-accent bg-editor-accent/5' : 'border-transparent bg-editor-surface'}`}>
      <div className="flex items-start gap-2">
        <input
          value={draft.title}
          onChange={(e) => onChange({ title: e.target.value })}
          className="min-w-0 flex-1 rounded border border-editor-border bg-editor-bg px-2 py-1.5 text-xs font-semibold text-editor-text focus:border-editor-accent focus:outline-none"
        />
        <ClipStatusBadge status={status} />
      </div>
      <div className="flex items-center justify-between text-[10px] text-editor-text-muted">
        <span>
          {formatClipTime(draft.startTime)} - {formatClipTime(draft.endTime)}
        </span>
        <span>{Math.round(draft.endTime - draft.startTime)}s</span>
      </div>
      {draft.exportPath && (
        <div className="truncate rounded bg-editor-bg px-2 py-1 text-[10px] text-editor-success" title={draft.exportPath}>
          Exported: {draft.exportPath}
        </div>
      )}
      {draft.lastError && (
        <div className="break-words rounded bg-editor-warning/10 px-2 py-1 text-[10px] text-editor-warning">
          {draft.lastError}
        </div>
      )}
      {!canExport && !isSuggested && exportValidation.reasons.length > 0 && (
        <div className="space-y-0.5 rounded bg-editor-warning/10 px-2 py-1 text-[10px] text-editor-warning">
          {exportValidation.reasons.map((reason) => (
            <div key={reason}>{reason}</div>
          ))}
        </div>
      )}
      {(draft.source || draft.speaker) && (
        <div className="flex flex-wrap items-center gap-1 text-[10px]">
          {draft.source && (
            <span className="rounded bg-editor-accent/10 px-1.5 py-0.5 text-editor-accent">
              {draft.source === 'speaker-turn'
                ? 'Speaker turn'
                : draft.source === 'transcript-selection'
                  ? 'Transcript clip'
                  : draft.source === 'ai-director'
                    ? 'AI Director'
                  : 'AI clip'}
            </span>
          )}
          {draft.speaker && (
            <span className="rounded bg-editor-border px-1.5 py-0.5 text-editor-text-muted">
              {draft.speaker}
            </span>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="In"
          value={draft.startTime}
          onChange={(startTime) => onTrim({ startTime: Math.max(0, Math.min(startTime, draft.endTime - 0.25)) })}
        />
        <NumberField
          label="Out"
          value={draft.endTime}
          onChange={(endTime) => onTrim({ endTime: Math.max(draft.startTime + 0.25, endTime) })}
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <MiniSelect
          label="Frame"
          value={draft.aspectRatio}
          onChange={(aspectRatio) =>
            onChange({
              aspectRatio: aspectRatio as ClipDraft['aspectRatio'],
              reframe: draft.reframe || { x: 50, y: 50 },
            })
          }
          options={[
            { value: 'source', label: 'Source' },
            { value: 'vertical', label: '9:16' },
            { value: 'square', label: '1:1' },
          ]}
        />
        <MiniSelect
          label="Quality"
          value={draft.resolution}
          onChange={(resolution) => onChange({ resolution: resolution as ClipDraft['resolution'] })}
          options={[
            { value: '720p', label: '720p' },
            { value: '1080p', label: '1080p' },
            { value: '4k', label: '4K' },
          ]}
        />
        <MiniSelect
          label="Format"
          value={draft.format}
          onChange={(format) => onChange({ format: format as ClipDraft['format'] })}
          options={[
            { value: 'mp4', label: 'MP4' },
            { value: 'mov', label: 'MOV' },
            { value: 'webm', label: 'WebM' },
          ]}
        />
      </div>
      {draft.aspectRatio !== 'source' && (
        <ClipReframeControls
          value={draft.reframe}
          onChange={(reframe) => onChange({ reframe })}
        />
      )}
      <div className="grid grid-cols-2 gap-2">
        <MiniSelect
          label="Captions"
          value={draft.captions || 'none'}
          onChange={(captions) =>
            onChange({
              captions: captions as ClipDraft['captions'],
              captionStyle: draft.captionStyle || CLIP_CAPTION_PRESETS.creator,
            })
          }
          options={[
            { value: 'none', label: 'None' },
            { value: 'burn-in', label: 'Burn-in' },
            { value: 'sidecar', label: 'SRT' },
          ]}
        />
        <MiniSelect
          label="Style"
          value={draft.captionStyle?.preset || 'creator'}
          onChange={(preset) =>
            onChange({
              captions: draft.captions === 'none' ? 'burn-in' : draft.captions,
              captionStyle: CLIP_CAPTION_PRESETS[preset as NonNullable<CaptionStyle['preset']>],
            })
          }
          options={[
            { value: 'clean', label: 'Clean' },
            { value: 'creator', label: 'Creator' },
            { value: 'karaoke', label: 'Karaoke' },
          ]}
        />
      </div>
      {(draft.captions || 'none') === 'burn-in' && (
        <ClipCaptionStyleControls
          value={draft.captionStyle || CLIP_CAPTION_PRESETS.creator}
          onChange={(captionStyle) => onChange({ captionStyle })}
        />
      )}
      <label className="flex items-center justify-between gap-2 rounded border border-editor-border bg-editor-bg px-2 py-1.5 text-[11px] text-editor-text-muted">
        <span>Enhance audio</span>
        <input
          type="checkbox"
          checked={!!draft.enhanceAudio}
          onChange={(e) => onChange({ enhanceAudio: e.target.checked })}
          className="h-3.5 w-3.5 rounded bg-editor-surface border-editor-border accent-editor-accent"
        />
      </label>
      <ClipBackgroundControls
        draft={draft}
        capabilities={backgroundCapabilities}
        onChange={onChange}
      />
      <p className="text-[11px] leading-snug text-editor-text-muted">{draft.reason}</p>
      {(isExporting || exportRetryable) && exportJob && (
        <div className="space-y-1 rounded bg-editor-bg px-2 py-1.5 text-[11px] text-editor-text-muted">
          <div className="flex justify-between gap-2">
            <span className="truncate">{exportJob.message || exportJob.status}</span>
            <span>{Math.round(exportJob.progress || 0)}%</span>
          </div>
          <div className="h-1 overflow-hidden rounded bg-editor-border">
            <div
              className="h-full bg-editor-success"
              style={{ width: `${Math.max(4, Math.min(100, exportJob.progress || 0))}%` }}
            />
          </div>
          {exportJob.error && <div className="break-words text-editor-warning">{exportJob.error}</div>}
        </div>
      )}
      <div className="space-y-1 rounded bg-editor-bg p-2 text-[11px] text-editor-text-muted">
          <div>
            <span className="font-medium text-editor-text">Transcript</span>
            <ClipTranscriptPreview
              words={clipWords}
              startWordIndex={draft.startWordIndex}
              activeWordIndex={isActive ? activeWordIndex : -1}
              fallback={transcriptSnippet || 'No transcript text available for this clip.'}
            />
          </div>
          <EditableText
            label="Hook"
            value={draft.hook || ''}
            placeholder="Opening hook"
            onChange={(hook) => onChange({ hook })}
          />
          <EditableText
            label="Description"
            value={draft.description || ''}
            placeholder="Short description"
            onChange={(description) => onChange({ description })}
          />
          <EditableText
            label="Caption"
            value={draft.caption || ''}
            placeholder="Social caption"
            onChange={(caption) => onChange({ caption })}
          />
          <EditableText
            label="Hashtags"
            value={(draft.hashtags || []).map((tag) => `#${tag.replace(/^#/, '')}`).join(' ')}
            placeholder="#shorts #clip"
            onChange={(value) =>
              onChange({
                hashtags: value
                  .split(/\s+/)
                  .map((tag) => tag.trim().replace(/^#/, ''))
                  .filter(Boolean),
              })
            }
          />
      </div>
      <div className="space-y-2 rounded bg-editor-bg p-2 text-[11px] text-editor-text-muted">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-editor-text">Social Pack</span>
          <button
            onClick={() => onCopySocialPackage()}
            className="rounded bg-editor-border px-2 py-1 text-[10px] text-editor-text-muted hover:bg-editor-surface"
          >
            Copy All
          </button>
        </div>
        <div className="space-y-1">
          {socialPack.map((item) => (
            <div
              key={item.platform}
              className="rounded border border-editor-border bg-editor-surface px-2 py-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-editor-text">{item.label}</span>
                <div className="flex items-center gap-1">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] ${item.ready ? 'bg-editor-success/20 text-editor-success' : 'bg-editor-warning/10 text-editor-warning'}`}>
                    {item.ready ? 'Ready' : 'Needs work'}
                  </span>
                  <button
                    onClick={() => onCopySocialPackage(item.platform)}
                    className="rounded bg-editor-border px-2 py-0.5 text-[10px] text-editor-text-muted hover:bg-editor-bg"
                  >
                    Copy
                  </button>
                </div>
              </div>
              <div className="mt-1 line-clamp-2">{item.caption || 'No caption yet.'}</div>
              <div className="mt-1 truncate text-[10px]">
                {item.hashtags.map((tag) => `#${tag}`).join(' ')}
              </div>
              {item.warnings.length > 0 && (
                <div className="mt-1 space-y-0.5 text-[10px] text-editor-warning">
                  {item.warnings.map((warning) => (
                    <div key={warning}>{warning}</div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-2 rounded bg-editor-bg p-2 text-[11px] text-editor-text-muted">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-editor-text">Hook Frames</span>
          <button
            onClick={() => onCopyHookFrame(selectedHookFrame)}
            className="rounded bg-editor-border px-2 py-1 text-[10px] text-editor-text-muted hover:bg-editor-surface"
          >
            Copy Brief
          </button>
        </div>
        <EditableText
          label="Thumbnail Text"
          value={draft.thumbnailText || draft.hook || ''}
          placeholder="Short overlay text"
          onChange={(thumbnailText) => onChange({ thumbnailText })}
        />
        <div className="grid grid-cols-2 gap-1">
          {hookFrames.map((frame) => {
            const selected = Math.abs(frame.time - selectedHookFrame.time) < 0.05;
            return (
              <div
                key={frame.id}
                className={`rounded border px-2 py-1.5 ${selected ? 'border-editor-accent bg-editor-accent/10' : 'border-editor-border bg-editor-surface'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-editor-text">{frame.label}</span>
                  <span>{formatClipTime(frame.time)}</span>
                </div>
                <div className="mt-1 truncate text-[10px]">{frame.filename}</div>
                {frame.warnings.length > 0 && (
                  <div className="mt-1 text-[10px] text-editor-warning">{frame.warnings[0]}</div>
                )}
                <div className="mt-1 grid grid-cols-3 gap-1">
                  <button
                    onClick={() => onPreviewHookFrame(frame.time)}
                    className="rounded bg-editor-accent/20 px-1.5 py-0.5 text-[10px] text-editor-accent hover:bg-editor-accent/30"
                  >
                    Cue
                  </button>
                  <button
                    onClick={() =>
                      onChange({
                        hookFrameTime: frame.time,
                        hookFrameLabel: frame.label,
                        thumbnailText: frame.overlayText || draft.thumbnailText || draft.hook || draft.title,
                      })
                    }
                    className="rounded bg-editor-border px-1.5 py-0.5 text-[10px] text-editor-text-muted hover:bg-editor-bg"
                  >
                    Set
                  </button>
                  <button
                    onClick={() => onCopyHookFrame(frame)}
                    className="rounded bg-editor-border px-1.5 py-0.5 text-[10px] text-editor-text-muted hover:bg-editor-bg"
                  >
                    Copy
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {isSuggested ? (
          <button
            onClick={onApprove}
            className="flex items-center justify-center gap-1 rounded bg-editor-success/20 px-2 py-1.5 text-xs text-editor-success hover:bg-editor-success/30"
          >
            <Check className="w-3 h-3" /> Approve
          </button>
        ) : (
          <button
            onClick={onDuplicate}
            className="flex items-center justify-center gap-1 rounded bg-editor-border px-2 py-1.5 text-xs text-editor-text-muted hover:bg-editor-bg"
          >
            <Plus className="w-3 h-3" /> Duplicate
          </button>
        )}
        <button
          onClick={onPreview}
          className="flex items-center justify-center gap-1 rounded bg-editor-accent/20 px-2 py-1.5 text-xs text-editor-accent hover:bg-editor-accent/30"
        >
          <Play className="w-3 h-3" /> Preview
        </button>
        <button
          onClick={onPackage}
          disabled={isSuggested || isPackaging}
          className="flex items-center justify-center gap-1 rounded bg-editor-accent/20 px-2 py-1.5 text-xs text-editor-accent hover:bg-editor-accent/30 disabled:opacity-50"
        >
          {isPackaging ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          Package
        </button>
        <button
          onClick={onCopyPackage}
          className="flex items-center justify-center gap-1 rounded bg-editor-border px-2 py-1.5 text-xs text-editor-text-muted hover:bg-editor-bg"
        >
          <Clipboard className="w-3 h-3" /> Copy
        </button>
        <button
          onClick={onExport}
          disabled={!canExport || isExporting || exportActive}
          className="flex items-center justify-center gap-1 rounded bg-editor-success/20 px-2 py-1.5 text-xs text-editor-success hover:bg-editor-success/30 disabled:opacity-50"
        >
          {isExporting || exportActive ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
          Export
        </button>
        {exportActive ? (
          <button
            onClick={onCancelExport}
            className="flex items-center justify-center gap-1 rounded bg-editor-border px-2 py-1.5 text-xs text-editor-text-muted hover:bg-editor-bg"
          >
            <X className="w-3 h-3" /> Cancel
          </button>
        ) : exportRetryable ? (
          <button
            onClick={onRetryExport}
            className="flex items-center justify-center gap-1 rounded bg-editor-accent/20 px-2 py-1.5 text-xs text-editor-accent hover:bg-editor-accent/30"
          >
            <RotateCcw className="w-3 h-3" /> Retry
          </button>
        ) : (
          <button
            onClick={onRemove}
            className="flex items-center justify-center gap-1 rounded bg-editor-border px-2 py-1.5 text-xs text-editor-text-muted hover:bg-editor-bg"
          >
            <X className="w-3 h-3" /> {isSuggested ? 'Reject' : 'Remove'}
          </button>
        )}
      </div>
    </div>
  );
}

function EditableText({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] uppercase tracking-wide text-editor-text-muted">{label}</span>
      <textarea
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        rows={label === 'Hook' || label === 'Hashtags' ? 1 : 2}
        className="w-full resize-none rounded border border-editor-border bg-editor-surface px-2 py-1 text-[11px] text-editor-text focus:border-editor-accent focus:outline-none"
      />
    </label>
  );
}

function ClipTranscriptPreview({
  words,
  startWordIndex,
  activeWordIndex,
  fallback,
}: {
  words: Word[];
  startWordIndex: number;
  activeWordIndex: number;
  fallback: string;
}) {
  if (words.length === 0) {
    return <p className="mt-1 line-clamp-3 leading-snug">{fallback}</p>;
  }

  return (
    <p className="mt-1 line-clamp-4 leading-snug">
      {words.map((word, localIndex) => {
        const globalIndex = startWordIndex + localIndex;
        const isActive = globalIndex === activeWordIndex;
        return (
          <span
            key={`${globalIndex}-${word.start}`}
            className={isActive ? 'rounded bg-editor-accent px-0.5 text-white' : undefined}
          >
            {word.word}{' '}
          </span>
        );
      })}
    </p>
  );
}

function ClipBackgroundControls({
  draft,
  capabilities,
  onChange,
}: {
  draft: ClipDraft;
  capabilities: BackgroundCapabilities | null;
  onChange: (patch: Partial<ClipDraft>) => void;
}) {
  const current = draft.backgroundRemoval || { enabled: false, replacement: 'blur' as const, color: '#111827' };
  const available = !!capabilities?.available;
  const update = (patch: Partial<NonNullable<ClipDraft['backgroundRemoval']>>) =>
    onChange({ backgroundRemoval: { ...current, ...patch } });

  const chooseImage = async () => {
    const imagePath = await window.electronAPI?.openFile({
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    });
    if (imagePath) update({ enabled: true, replacement: 'image', imagePath });
  };

  return (
    <div className="space-y-2 rounded border border-editor-border bg-editor-bg p-2">
      <label className="flex items-center justify-between gap-2 text-[11px] text-editor-text-muted">
        <span className="space-y-0.5">
          <span className="block">Remove background</span>
          <span className={`block text-[10px] ${available ? 'text-editor-success' : 'text-editor-warning'}`}>
            {available ? 'Local segmentation ready' : 'Requires MediaPipe + OpenCV'}
          </span>
        </span>
        <input
          type="checkbox"
          checked={current.enabled}
          onChange={(e) => update({ enabled: e.target.checked })}
          className="h-3.5 w-3.5 rounded bg-editor-surface border-editor-border accent-editor-accent"
        />
      </label>
      {current.enabled && (
        <div className="grid grid-cols-2 gap-2">
          <MiniSelect
            label="Replace"
            value={current.replacement}
            onChange={(replacement) =>
              update({ replacement: replacement as NonNullable<ClipDraft['backgroundRemoval']>['replacement'] })
            }
            options={[
              { value: 'blur', label: 'Blur' },
              { value: 'color', label: 'Color' },
              { value: 'image', label: 'Image' },
            ]}
          />
          {current.replacement === 'color' ? (
            <label className="space-y-1">
              <span className="text-[10px] text-editor-text-muted">Color</span>
              <input
                type="color"
                value={current.color}
                onChange={(e) => update({ color: e.target.value })}
                className="h-7 w-full rounded border border-editor-border bg-editor-surface"
              />
            </label>
          ) : (
            <button
              onClick={chooseImage}
              disabled={current.replacement !== 'image'}
              className="mt-4 flex items-center justify-center gap-1 rounded border border-editor-border bg-editor-surface px-2 py-1.5 text-[11px] text-editor-text-muted hover:text-editor-text disabled:opacity-40"
            >
              <Image className="h-3 w-3" />
              {current.imagePath ? 'Change' : 'Image'}
            </button>
          )}
        </div>
      )}
      {current.enabled && current.replacement === 'image' && current.imagePath && (
        <div className="truncate text-[10px] text-editor-text-muted">{current.imagePath}</div>
      )}
      {current.enabled && !available && (
        <div className="rounded bg-editor-warning/10 px-2 py-1 text-[10px] text-editor-warning">
          This draft will fail background removal until the backend has MediaPipe and OpenCV available.
        </div>
      )}
    </div>
  );
}

function ClipCaptionStyleControls({
  value,
  onChange,
}: {
  value: CaptionStyle;
  onChange: (value: CaptionStyle) => void;
}) {
  const update = (patch: Partial<CaptionStyle>) => onChange({ ...value, ...patch, preset: undefined });

  return (
    <div className="space-y-2 rounded border border-editor-border bg-editor-bg p-2">
      <CaptionPreview style={value} />

      <div className="grid grid-cols-2 gap-2">
        <MiniSelect
          label="Position"
          value={value.position}
          onChange={(position) => update({ position: position as CaptionStyle['position'] })}
          options={[
            { value: 'bottom', label: 'Bottom' },
            { value: 'center', label: 'Center' },
            { value: 'top', label: 'Top' },
          ]}
        />
        <MiniSelect
          label="Words"
          value={String(value.wordsPerLine ?? 5)}
          onChange={(wordsPerLine) => update({ wordsPerLine: Number(wordsPerLine) })}
          options={[
            { value: '3', label: '3' },
            { value: '5', label: '5' },
            { value: '8', label: '8' },
            { value: '12', label: '12' },
          ]}
        />
      </div>
      <label className="space-y-1 block">
        <span className="text-[10px] text-editor-text-muted">Font Size</span>
        <input
          type="range"
          min="32"
          max="84"
          value={value.fontSize}
          onChange={(e) => update({ fontSize: Number(e.target.value) })}
          className="w-full accent-editor-accent"
        />
        <span className="block text-[10px] text-editor-text-muted">{value.fontSize}px</span>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <MiniColorField
          label="Text"
          value={value.fontColor}
          onChange={(fontColor) => update({ fontColor })}
        />
        <MiniColorField
          label="Highlight"
          value={value.highlightColor || value.fontColor}
          onChange={(highlightColor) => update({ highlightColor })}
        />
      </div>
      <label className="flex items-center gap-2 text-[11px] text-editor-text-muted">
        <input
          type="checkbox"
          checked={value.bold}
          onChange={(e) => update({ bold: e.target.checked })}
          className="h-3.5 w-3.5 rounded bg-editor-surface border-editor-border accent-editor-accent"
        />
        Bold
      </label>
    </div>
  );
}

function ClipStatusBadge({ status }: { status: ClipDraftStatus }) {
  const classes: Record<ClipDraftStatus, string> = {
    suggested: 'bg-editor-accent/15 text-editor-accent',
    draft: 'bg-editor-border text-editor-text-muted',
    packaged: 'bg-editor-success/20 text-editor-success',
    exporting: 'bg-editor-accent/20 text-editor-accent',
    exported: 'bg-editor-success/20 text-editor-success',
    failed: 'bg-editor-warning/10 text-editor-warning',
  };
  const labels: Record<ClipDraftStatus, string> = {
    suggested: 'Suggested',
    draft: 'Approved',
    packaged: 'Packaged',
    exporting: 'Exporting',
    exported: 'Exported',
    failed: 'Failed',
  };

  return (
    <span className={`shrink-0 rounded px-1.5 py-1 text-[10px] font-medium ${classes[status]}`}>
      {labels[status]}
    </span>
  );
}

function createShortsClipDraft(
  clip: ClipSuggestion,
  id: string,
  status: ClipDraftStatus,
  source: ClipDraft['source'] = 'ai',
  speaker?: string,
): ClipDraft {
  return {
    ...clip,
    id,
    status,
    ...SHORTS_DRAFT_DEFAULTS,
    source,
    speaker,
  };
}

function ClipReframeControls({
  value,
  onChange,
}: {
  value: ClipDraft['reframe'];
  onChange: (value: NonNullable<ClipDraft['reframe']>) => void;
}) {
  const current = value || { x: 50, y: 50 };
  const update = (patch: Partial<NonNullable<ClipDraft['reframe']>>) =>
    onChange({ ...current, ...patch });

  return (
    <div className="space-y-2 rounded border border-editor-border bg-editor-bg p-2">
      <ClipRangeField
        label="Horizontal"
        value={current.x}
        leftLabel="Left"
        rightLabel="Right"
        onChange={(x) => update({ x })}
      />
      <ClipRangeField
        label="Vertical"
        value={current.y}
        leftLabel="Top"
        rightLabel="Bottom"
        onChange={(y) => update({ y })}
      />
      <button
        onClick={() => onChange({ x: 50, y: 50 })}
        className="rounded bg-editor-border px-2 py-1 text-[10px] text-editor-text-muted hover:bg-editor-surface"
      >
        Center crop
      </button>
    </div>
  );
}

function ClipRangeField({
  label,
  value,
  leftLabel,
  rightLabel,
  onChange,
}: {
  label: string;
  value: number;
  leftLabel: string;
  rightLabel: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block space-y-1">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-editor-text-muted">{label}</span>
        <span className="font-mono text-editor-text-muted">{Math.round(value)}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-editor-accent"
      />
      <div className="flex justify-between text-[9px] text-editor-text-muted">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
    </label>
  );
}

function MiniColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="text-[10px] text-editor-text-muted">{label}</span>
      <span className="flex items-center gap-1 rounded border border-editor-border bg-editor-surface px-1.5 py-1">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-5 w-5 shrink-0 border-0 bg-transparent p-0"
        />
        <span className="truncate font-mono text-[10px] text-editor-text-muted uppercase">{value}</span>
      </span>
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="text-[10px] text-editor-text-muted">{label}</span>
      <input
        type="number"
        min="0"
        step="0.1"
        value={Number(value.toFixed(1))}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
        className="w-full rounded border border-editor-border bg-editor-bg px-2 py-1 text-xs text-editor-text focus:border-editor-accent focus:outline-none"
      />
    </label>
  );
}

function MiniSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="space-y-1 min-w-0">
      <span className="text-[10px] text-editor-text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-editor-border bg-editor-bg px-1.5 py-1 text-[11px] text-editor-text focus:border-editor-accent focus:outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function formatClipTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function isPreviewAspectRatio(value: unknown): value is ClipDraft['aspectRatio'] {
  return value === 'source' || value === 'vertical' || value === 'square';
}

function buildClipCaptionWords(words: Word[], startIndex: number, endIndex: number, clipStartTime: number) {
  return words.slice(startIndex, endIndex + 1).map((word) => ({
    ...word,
    start: Math.max(0, word.start - clipStartTime),
    end: Math.max(0, word.end - clipStartTime),
  }));
}

function isEditSuggestionAlreadyCut(suggestion: EditPlanSuggestion, deletedWordMap: Map<number, string>) {
  for (let index = suggestion.startWordIndex; index <= suggestion.endWordIndex; index++) {
    if (!deletedWordMap.has(index)) return false;
  }
  return true;
}

function formatClipPackage(draft: ClipDraft, words: Word[]) {
  const transcript = words.map((word) => word.word).join(' ').replace(/\s+/g, ' ').trim();
  const hashtags = (draft.hashtags || [])
    .map((tag) => `#${tag.replace(/^#/, '')}`)
    .join(' ');
  const lines = [
    `Title: ${draft.title}`,
    draft.hook ? `Hook: ${draft.hook}` : '',
    draft.caption ? `Caption: ${draft.caption}` : '',
    draft.description ? `Description: ${draft.description}` : '',
    hashtags ? `Hashtags: ${hashtags}` : '',
    `Timing: ${formatClipTime(draft.startTime)} - ${formatClipTime(draft.endTime)} (${Math.round(draft.endTime - draft.startTime)}s)`,
    `Frame: ${draft.aspectRatio === 'vertical' ? '9:16' : draft.aspectRatio === 'square' ? '1:1' : 'source'}`,
    `Export: ${draft.resolution} ${draft.format.toUpperCase()}${draft.captions && draft.captions !== 'none' ? `, ${draft.captions} captions` : ''}`,
    draft.reframe && draft.aspectRatio !== 'source'
      ? `Reframe: ${Math.round(draft.reframe.x)}% horizontal, ${Math.round(draft.reframe.y)}% vertical`
      : '',
    draft.backgroundRemoval?.enabled
      ? `Background: ${draft.backgroundRemoval.replacement}`
      : '',
    transcript ? `Transcript: ${transcript}` : '',
  ];

  return lines.filter(Boolean).join('\n');
}

function getPathSeparator(path: string) {
  return path.includes('\\') ? '\\' : '/';
}

function getPathDirectory(path: string) {
  const separator = getPathSeparator(path);
  const index = path.lastIndexOf(separator);
  return index > 0 ? path.slice(0, index) : '';
}

function joinPath(directory: string, filename: string) {
  const separator = getPathSeparator(directory);
  const trimmed = directory.replace(/[\\/]+$/, '');
  if (!trimmed) return filename;
  return `${trimmed}${separator}${filename}`;
}

function safeFileStem(value: string) {
  const stem = value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 42);
  return stem || 'scriptcut_clip';
}

function buildClipOutputPath(directory: string, title: string, format: ClipDraft['format'], id?: string) {
  const suffix = id ? `_${safeFileStem(id).slice(-12)}` : `_${Date.now()}`;
  return joinPath(directory, `${safeFileStem(title)}${suffix}.${format}`);
}

function timestampForFilename(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

async function writeClipBatchManifest({
  directory,
  videoPath,
  results,
  words,
}: {
  directory: string;
  videoPath: string | null;
  results: BatchExportResult[];
  words: Word[];
}) {
  if (!directory || !window.electronAPI?.writeFile) return '';
  const manifestPath = joinPath(directory, `scriptcut_clip_manifest_${timestampForFilename()}.json`);
  const manifest = {
    app: 'ScriptCut',
    schema: 'scriptcut.clipBatchManifest.v1',
    generatedAt: new Date().toISOString(),
    videoPath,
    summary: {
      total: results.length,
      exported: results.filter((result) => result.outputPath).length,
      failed: results.filter((result) => result.error).length,
    },
    clips: results.map(({ draft, outputPath, error }) => ({
      id: draft.id,
      title: draft.title,
      status: outputPath ? 'exported' : 'failed',
      outputPath,
      error,
      startTime: draft.startTime,
      endTime: draft.endTime,
      duration: draft.endTime - draft.startTime,
      platform: draft.platform || 'shorts',
      package: {
        hook: draft.hook || '',
        caption: draft.caption || '',
        description: draft.description || '',
        hashtags: draft.hashtags || [],
      },
      socialPublishing: buildSocialPublishingPack(draft).map((item) => ({
        platform: item.platform,
        title: item.title,
        caption: item.caption,
        hashtags: item.hashtags,
        ready: item.ready,
        warnings: item.warnings,
      })),
      hookFrame: {
        label: draft.hookFrameLabel || getSelectedHookFrame(draft).label,
        time: draft.hookFrameTime ?? getSelectedHookFrame(draft).time,
        thumbnailText: draft.thumbnailText || draft.hook || draft.title,
        filename: getSelectedHookFrame(draft).filename,
        brief: formatHookFrameBrief(draft),
      },
      export: {
        format: draft.format,
        resolution: draft.resolution,
        aspectRatio: draft.aspectRatio,
        captions: draft.captions || 'none',
        enhanceAudio: !!draft.enhanceAudio,
      },
      transcript: getClipTranscript(words, draft),
    })),
  };
  await window.electronAPI.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  return manifestPath;
}

function getFillerReasonBucket(word: string, reason: string) {
  const text = `${word} ${reason}`.toLowerCase();
  if (/\b(um|uh|uhh|umm|hmm)\b/.test(text) || text.includes('hesitation')) return 'Hesitation';
  if (text.includes('stammer') || text.includes('repeat')) return 'Stammer';
  if (text.includes('like') || text.includes('you know') || text.includes('right')) return 'Discourse marker';
  if (text.includes('start') || text.includes('sentence')) return 'Sentence starter';
  if (text.includes('custom') || text.includes('user')) return 'Custom phrase';
  return 'General filler';
}

function AIJobStatusCard({
  job,
  onCancel,
  onRetry,
}: {
  job: AIJob<unknown> & AIJobContext;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const canCancel = job.status === 'queued' || job.status === 'running';
  const canRetry = job.status === 'failed' || job.status === 'canceled';
  const latestLogs = (job.logs || []).slice(-4);

  return (
    <div className="mb-4 space-y-2 rounded bg-editor-surface px-3 py-2 text-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-editor-text">{job.label}</div>
          <div className="truncate text-[11px] text-editor-text-muted">
            {job.message || job.status}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          {canCancel && (
            <button
              onClick={onCancel}
              className="rounded bg-editor-border px-2 py-1 text-[11px] text-editor-text-muted hover:bg-editor-panel"
            >
              Cancel
            </button>
          )}
          {canRetry && (
            <button
              onClick={onRetry}
              className="rounded bg-editor-accent/20 px-2 py-1 text-[11px] text-editor-accent hover:bg-editor-accent/30"
            >
              Retry
            </button>
          )}
        </div>
      </div>
      <div className="h-1.5 overflow-hidden rounded bg-editor-border">
        <div
          className={`h-full ${
            job.status === 'failed'
              ? 'bg-editor-warning'
              : job.status === 'succeeded'
                ? 'bg-editor-success'
                : 'bg-editor-accent'
          }`}
          style={{ width: `${Math.max(0, Math.min(100, job.progress || 0))}%` }}
        />
      </div>
      {latestLogs.length > 0 && (
        <details className="text-[11px] text-editor-text-muted">
          <summary className="cursor-pointer select-none">Logs</summary>
          <div className="mt-1 max-h-24 space-y-1 overflow-y-auto rounded bg-editor-panel px-2 py-1">
            {latestLogs.map((log, index) => (
              <div key={`${log.time}-${index}`} className="whitespace-pre-wrap break-words">
                {log.message}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function FillerReviewItem({
  word,
  reason,
  confidence,
  decision,
  alreadyCut,
  onPreview,
  onAccept,
  onReject,
  onRestore,
}: {
  word: string;
  reason: string;
  confidence?: number;
  decision?: FillerReviewDecision;
  alreadyCut?: boolean;
  onPreview: () => void;
  onAccept: () => void;
  onReject: () => void;
  onRestore: () => void;
}) {
  const confidenceValue = confidence ?? 0;
  const confidenceLabel =
    confidenceValue >= 0.85 ? 'Safe' : confidenceValue >= 0.6 ? 'Review' : 'Low';

  return (
    <div className="space-y-2 rounded bg-editor-word-filler px-2.5 py-2 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold truncate">"{word}"</div>
          <div className="text-[11px] text-editor-text-muted leading-snug">{reason}</div>
          {confidence !== undefined && (
            <div className="mt-1 flex items-center gap-1 text-[10px] text-editor-text-muted">
              <span
                className={`rounded px-1.5 py-0.5 ${
                  confidenceValue >= 0.85
                    ? 'bg-editor-success/20 text-editor-success'
                    : confidenceValue >= 0.6
                      ? 'bg-editor-accent/15 text-editor-accent'
                      : 'bg-editor-warning/10 text-editor-warning'
                }`}
              >
                {confidenceLabel}
              </span>
              <span>{Math.round(confidenceValue * 100)}% confidence</span>
            </div>
          )}
        </div>
        {(decision || alreadyCut) && (
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${
              decision === 'accepted'
                ? 'bg-editor-success/20 text-editor-success'
                : 'bg-editor-border text-editor-text-muted'
            }`}
          >
            {alreadyCut ? 'Already cut' : decision === 'accepted' ? 'Accepted' : 'Rejected'}
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-1">
        <button
          onClick={onPreview}
          className="flex items-center justify-center gap-1 rounded bg-editor-accent/20 px-2 py-1 text-[11px] text-editor-accent hover:bg-editor-accent/30"
        >
          <Play className="w-3 h-3" /> Preview
        </button>
        {decision === 'accepted' ? (
          <button
            onClick={onRestore}
            className="flex items-center justify-center gap-1 rounded bg-editor-border px-2 py-1 text-[11px] text-editor-text-muted hover:bg-editor-surface"
          >
            <RotateCcw className="w-3 h-3" /> Restore
          </button>
        ) : (
          <button
            onClick={onAccept}
            disabled={decision === 'rejected' || alreadyCut}
            className="flex items-center justify-center gap-1 rounded bg-editor-success/20 px-2 py-1 text-[11px] text-editor-success hover:bg-editor-success/30 disabled:opacity-40"
          >
            <Check className="w-3 h-3" /> Accept
          </button>
        )}
        <button
          onClick={onReject}
          disabled={decision === 'accepted'}
          className="flex items-center justify-center gap-1 rounded bg-editor-border px-2 py-1 text-[11px] text-editor-text-muted hover:bg-editor-surface disabled:opacity-40"
        >
          <X className="w-3 h-3" /> Reject
        </button>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors border-b-2 ${
        active
          ? 'border-editor-accent text-editor-accent'
          : 'border-transparent text-editor-text-muted hover:text-editor-text'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
