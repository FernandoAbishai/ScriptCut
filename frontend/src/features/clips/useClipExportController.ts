import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CreatorNoticeData } from '../../components/CreatorNotice';
import { useAIStore } from '../../store/aiStore';
import { useEditorStore } from '../../store/editorStore';
import type { ClipDraft, ClipSuggestion } from '../../types/project';
import {
  buildClipExportCaptionWords,
  getClipExportSegments,
  getWordIndicesForClip,
  validateClipDraftForExport,
} from '../../utils/clipDrafts';
import {
  getClipBatchExportCandidates,
  getClipBatchProgressSummary,
  getCurrentClipBatchDraftForExport,
  type ClipBatchProgressInput,
} from '../../utils/clipBatchExport';
import { getCreatorErrorPresentation } from '../../utils/creatorErrors';
import { SHORTS_DRAFT_DEFAULTS } from './clipDraftModel';
import {
  buildClipOutputPath,
  getPathDirectory,
  writeClipBatchManifest,
  type ClipBatchExportResult,
} from './clipExportFiles';
import type { ClipExportOutput, ExportJob } from './types';

const CLIP_EXPORT_DIRECTORY_KEY = 'scriptcut.clipExport.directory';

type UseClipExportControllerOptions = {
  setCreatorNotice: (notice: CreatorNoticeData | null) => void;
};

export function useClipExportController({
  setCreatorNotice,
}: UseClipExportControllerOptions) {
  const videoPath = useEditorStore((state) => state.videoPath);
  const words = useEditorStore((state) => state.words);
  const deletedRanges = useEditorStore((state) => state.deletedRanges);
  const backendUrl = useEditorStore((state) => state.backendUrl);
  const getCaptionHiddenIndices = useEditorStore((state) => state.getCaptionHiddenIndices);
  const getMutedRanges = useEditorStore((state) => state.getMutedRanges);

  const clipDrafts = useAIStore((state) => state.clipDrafts);
  const setClipDrafts = useAIStore((state) => state.setClipDrafts);
  const clipWorkspaceEpoch = useAIStore((state) => state.clipWorkspaceEpoch);

  const [clipExportDirectory, setClipExportDirectory] = useState(
    () => window.localStorage.getItem(CLIP_EXPORT_DIRECTORY_KEY) || '',
  );
  const [exportingDraftId, setExportingDraftId] = useState<string | null>(null);
  const [clipExportJobs, setClipExportJobs] = useState<Record<string, ExportJob>>({});
  const [clipExportOutputs, setClipExportOutputs] = useState<Record<string, ClipExportOutput>>({});
  const [isBatchExporting, setBatchExporting] = useState(false);
  const [batchExportProgress, setBatchExportProgress] = useState<ClipBatchProgressInput>({
    processed: 0,
    total: 0,
    exported: 0,
    failed: 0,
    stopping: false,
  });
  const stopBatchExportRef = useRef(false);
  const exportBusy = isBatchExporting || exportingDraftId !== null;

  const isCurrentClipWorkspace = useCallback(
    () => useAIStore.getState().clipWorkspaceEpoch === clipWorkspaceEpoch,
    [clipWorkspaceEpoch],
  );

  const updateClipDraft = useCallback((id: string, patch: Partial<ClipDraft>) => {
    if (!isCurrentClipWorkspace()) return;
    setClipDrafts((current) => current.map((draft) =>
      draft.id === id ? { ...draft, ...patch } : draft,
    ));
  }, [isCurrentClipWorkspace, setClipDrafts]);

  useEffect(() => {
    if (!videoPath) return;
    setClipExportDirectory((current) => current || getPathDirectory(videoPath));
  }, [videoPath]);

  useEffect(() => {
    setClipExportOutputs({});
  }, [clipWorkspaceEpoch]);

  const exportCandidateDrafts = useMemo(
    () => getClipBatchExportCandidates(clipDrafts, words, videoPath),
    [clipDrafts, videoPath, words],
  );

  const clearClipExportAttempt = useCallback((draftId: string) => {
    setClipExportJobs((current) => {
      if (!current[draftId]) return current;
      const next = { ...current };
      delete next[draftId];
      return next;
    });
    setClipExportOutputs((current) => {
      if (!current[draftId]) return current;
      const next = { ...current };
      delete next[draftId];
      return next;
    });
  }, []);

  const chooseClipExportDirectory = useCallback(async () => {
    if (exportBusy) return;
    if (!window.electronAPI?.openDirectory) return;
    const directory = await window.electronAPI.openDirectory({
      title: 'Choose clip export folder',
      defaultPath: clipExportDirectory || (videoPath ? getPathDirectory(videoPath) : undefined),
    });
    if (!directory) return;
    if (!isCurrentClipWorkspace()) return;
    setClipExportDirectory(directory);
    window.localStorage.setItem(CLIP_EXPORT_DIRECTORY_KEY, directory);
    setClipDrafts((current) => current.map((draft) => ({ ...draft, exportDirectory: directory })));
  }, [clipExportDirectory, exportBusy, isCurrentClipWorkspace, setClipDrafts, videoPath]);

  const updateClipExportDirectory = useCallback((directory: string) => {
    if (exportBusy) return;
    setClipExportDirectory(directory);
    if (directory) window.localStorage.setItem(CLIP_EXPORT_DIRECTORY_KEY, directory);
    else window.localStorage.removeItem(CLIP_EXPORT_DIRECTORY_KEY);
    setClipDrafts((current) => current.map((draft) => ({
      ...draft,
      exportDirectory: directory || undefined,
    })));
  }, [exportBusy, setClipDrafts]);

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
          const outputPath = job.result?.output_path?.trim() || '';
          if (!outputPath) {
            throw new Error('Export completed without a confirmed output file. Retry this clip.');
          }
          return {
            outputPath,
            srtPath: job.result?.srt_path,
            fileCapability: job.result?.file_capability,
            srtFileCapability: job.result?.srt_file_capability,
            warnings: job.result?.warnings || [],
          } satisfies ClipExportOutput;
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
      try {
        if (!isCurrentClipWorkspace()) throw new Error('The media workspace changed while this export was running.');
        if (!videoPath) throw new Error('Load a video before exporting a clip.');
        const clipWordIndices = getWordIndicesForClip(words, clip);
        if (clipWordIndices.length === 0) throw new Error('This clip has no transcript range to export.');
        if (!Number.isFinite(clip.startTime) || !Number.isFinite(clip.endTime) || clip.endTime - clip.startTime < 0.25) {
          throw new Error('Set a clip range of at least 0.25 seconds before exporting.');
        }
        if (settings?.id) {
          const validation = validateClipDraftForExport(settings as ClipDraft, words, videoPath);
          if (!validation.ready) throw new Error(validation.reasons.join('\n'));
        }

        const format = settings?.format ?? 'mp4';
        const aspectRatio = settings?.aspectRatio ?? SHORTS_DRAFT_DEFAULTS.aspectRatio;
        const captions = settings?.captions ?? SHORTS_DRAFT_DEFAULTS.captions;
        const outputDirectory = settings?.exportDirectory || clipExportDirectory || getPathDirectory(videoPath);
        if (!outputDirectory) throw new Error('Choose an export folder before exporting this clip.');
        const outputPath = buildClipOutputPath(outputDirectory, clip.title, format, settings?.id);
        const captionHidden = new Set(getCaptionHiddenIndices());
        const keepSegments = getClipExportSegments(clip, deletedRanges);
        if (keepSegments.length === 0) {
          throw new Error('Every part of this clip has been removed in the transcript. Restore content or adjust the clip range.');
        }
        const clipWords = buildClipExportCaptionWords(words, clip, keepSegments, captionHidden);
        const mutedRanges = getMutedRanges().filter(
          (range) => range.end > clip.startTime && range.start < clip.endTime,
        );

        if (settings?.id) {
          updateClipDraft(settings.id, { status: 'exporting', lastError: undefined });
        }

        const res = await fetch(`${backendUrl}/jobs/export`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input_path: videoPath,
            output_path: outputPath,
            keep_segments: keepSegments,
            mode: keepSegments.length === 1 && aspectRatio === 'source' && format === 'mp4' && captions !== 'burn-in' ? 'fast' : 'reencode',
            resolution: settings?.resolution ?? '1080p',
            aspectRatio,
            reframe: settings?.reframe ?? (aspectRatio === 'vertical' ? SHORTS_DRAFT_DEFAULTS.reframe : undefined),
            format,
            enhanceAudio: !!settings?.enhanceAudio,
            captions,
            captionStyle: captions === 'burn-in' ? settings?.captionStyle ?? SHORTS_DRAFT_DEFAULTS.captionStyle : undefined,
            word_timeline: 'export',
            words: captions !== 'none' ? clipWords : undefined,
            muted_ranges: mutedRanges,
            backgroundRemoval: settings?.backgroundRemoval?.enabled ? settings.backgroundRemoval : undefined,
          }),
        });
        if (!res.ok) {
          let detail = `Export could not start (${res.status}).`;
          try {
            const body = await res.json() as { detail?: unknown };
            if (typeof body.detail === 'string') detail = body.detail;
          } catch {
            // Keep the HTTP status when the backend cannot return a JSON error.
          }
          throw new Error(detail);
        }
        const { job_id: jobId } = await res.json();
        if (!isCurrentClipWorkspace()) throw new Error('The media workspace changed while this export was running.');
        if (settings?.id) {
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
        if (!isCurrentClipWorkspace()) throw new Error('The media workspace changed while this export was running.');
        if (settings?.id) {
          updateClipDraft(settings.id, {
            status: 'exported',
            exportPath: output.outputPath,
            srtPath: output.srtPath,
            exportWarnings: output.warnings,
            exportedAt: new Date().toISOString(),
            lastError: undefined,
          });
          setClipExportOutputs((current) => ({ ...current, [settings.id!]: output }));
        }
        if (!silent) {
          setCreatorNotice({
            tone: 'success',
            title: 'Clip exported',
            message: output.srtPath ? `Saved to ${output.outputPath}; captions saved to ${output.srtPath}.` : `Saved to ${output.outputPath}.`,
            technicalDetails: output.warnings.length ? output.warnings.join('\n') : undefined,
            onDismiss: () => setCreatorNotice(null),
          });
        }
        return output;
      } catch (err) {
        console.error(err);
        const message = err instanceof Error ? err.message : String(err);
        if (settings?.id) {
          updateClipDraft(settings.id, { status: 'failed', lastError: message });
        }
        if (!silent && !message.toLowerCase().includes('canceled')) {
          setCreatorNotice({ ...getCreatorErrorPresentation('clip-action', err), onDismiss: () => setCreatorNotice(null) });
        }
        throw err;
      }
    },
    [
      backendUrl,
      clipExportDirectory,
      deletedRanges,
      getCaptionHiddenIndices,
      getMutedRanges,
      isCurrentClipWorkspace,
      pollClipExportJob,
      setCreatorNotice,
      updateClipDraft,
      videoPath,
      words,
    ],
  );

  const cancelDraftExport = useCallback(
    async (draftId: string) => {
      const job = clipExportJobs[draftId];
      if (!job || !['queued', 'running'].includes(job.status)) return;
      const res = await fetch(`${backendUrl}/jobs/${job.id}/cancel`, { method: 'POST' });
      if (res.ok) {
        const canceledJob = (await res.json()) as ExportJob;
        setClipExportJobs((current) => ({ ...current, [draftId]: canceledJob }));
      }
    },
    [backendUrl, clipExportJobs],
  );

  const retryDraftExport = useCallback(
    async (draft: ClipDraft) => {
      if (exportBusy) return;
      const currentDraft = useAIStore.getState().clipDrafts.find((candidate) => candidate.id === draft.id) || draft;
      if ((currentDraft.status || 'draft') !== 'failed') return;
      const validation = validateClipDraftForExport(currentDraft, words, videoPath);
      if (!validation.ready) {
        setCreatorNotice({
          tone: 'warning',
          title: 'Clip needs preparation before retry',
          message: 'Review the clip in Prepare before retrying this export.',
          technicalDetails: validation.reasons.join('\n'),
          onDismiss: () => setCreatorNotice(null),
        });
        return;
      }
      clearClipExportAttempt(currentDraft.id);
      setExportingDraftId(currentDraft.id);
      try {
        const output = await handleExportClip(currentDraft, currentDraft, true);
        updateClipDraft(currentDraft.id, {
          status: 'exported',
          exportPath: output.outputPath,
          srtPath: output.srtPath,
          exportWarnings: output.warnings,
          exportedAt: new Date().toISOString(),
          lastError: undefined,
        });
        setClipExportOutputs((current) => ({ ...current, [currentDraft.id]: output }));
        setCreatorNotice({
          tone: 'success',
          title: 'Clip exported',
          message: output.srtPath ? `Saved to ${output.outputPath}; captions saved to ${output.srtPath}.` : `Saved to ${output.outputPath}.`,
          technicalDetails: output.warnings.length ? output.warnings.join('\n') : undefined,
          onDismiss: () => setCreatorNotice(null),
        });
      } catch (err) {
        console.error(err);
        updateClipDraft(currentDraft.id, { status: 'failed', lastError: err instanceof Error ? err.message : String(err) });
        setCreatorNotice({ ...getCreatorErrorPresentation('clip-action', err), onDismiss: () => setCreatorNotice(null) });
      } finally {
        setExportingDraftId(null);
      }
    },
    [clearClipExportAttempt, exportBusy, handleExportClip, setCreatorNotice, updateClipDraft, videoPath, words],
  );

  const handleExportDraft = useCallback(
    async (draft: ClipDraft) => {
      if (exportBusy) return;
      const currentDraft = useAIStore.getState().clipDrafts.find((candidate) => candidate.id === draft.id) || draft;
      if (currentDraft.status !== 'packaged') {
        setCreatorNotice({
          tone: 'warning',
          title: 'Prepare this clip first',
          message: 'Move the clip through Prepare before exporting it.',
          onDismiss: () => setCreatorNotice(null),
        });
        return;
      }
      const validation = validateClipDraftForExport(currentDraft, words, videoPath);
      if (!validation.ready) {
        setCreatorNotice({
          tone: 'warning',
          title: 'Clip isn’t ready to export',
          message: 'Review the readiness details before exporting.',
          technicalDetails: validation.reasons.join('\n'),
          onDismiss: () => setCreatorNotice(null),
        });
        return;
      }
      setExportingDraftId(currentDraft.id);
      try {
        await handleExportClip(currentDraft, currentDraft);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!message.toLowerCase().includes('canceled')) {
          console.error(err);
        }
      } finally {
        setExportingDraftId(null);
      }
    },
    [exportBusy, handleExportClip, setCreatorNotice, videoPath, words],
  );

  const handleExportAllDrafts = useCallback(async () => {
    if (exportBusy) return;
    const exportableDrafts = getClipBatchExportCandidates(clipDrafts, words, videoPath);
    if (exportableDrafts.length === 0) return;
    stopBatchExportRef.current = false;
    setBatchExporting(true);
    setBatchExportProgress(
      getClipBatchProgressSummary({
        processed: 0,
        total: exportableDrafts.length,
        exported: 0,
        failed: 0,
        stopping: false,
      }),
    );
    const results: ClipBatchExportResult[] = [];
    let pausedForDraftChange = false;
    try {
      for (let index = 0; index < exportableDrafts.length; index++) {
        if (stopBatchExportRef.current) break;
        const plannedDraft = exportableDrafts[index];
        const draft = getCurrentClipBatchDraftForExport(
          useAIStore.getState().clipDrafts,
          plannedDraft.id,
          words,
          videoPath,
        );
        if (!draft) {
          pausedForDraftChange = true;
          break;
        }
        setExportingDraftId(draft.id);
        setClipExportJobs((current) => {
          const next = { ...current };
          delete next[draft.id];
          return next;
        });
        try {
          const output = await handleExportClip(draft, draft, true);
          results.push({ draft, outputPath: output.outputPath, srtPath: output.srtPath, warnings: output.warnings });
        } catch (err) {
          results.push({ draft, error: err instanceof Error ? err.message : String(err) });
        }
        setBatchExportProgress(
          getClipBatchProgressSummary({
            processed: index + 1,
            total: exportableDrafts.length,
            exported: results.filter((result) => result.outputPath).length,
            failed: results.filter((result) => result.error).length,
            stopping: stopBatchExportRef.current,
          }),
        );
      }
      const successCount = results.filter((result) => result.outputPath).length;
      const failedCount = results.filter((result) => result.error).length;
      const remainingDrafts = exportableDrafts.slice(results.length);
      const stopped = (stopBatchExportRef.current || pausedForDraftChange) && remainingDrafts.length > 0;
      let manifestPath = '';
      let manifestWarning = '';
      try {
        manifestPath = await writeClipBatchManifest({
          directory: clipExportDirectory || (videoPath ? getPathDirectory(videoPath) : ''),
          writeManifest: window.electronAPI?.writeClipManifest,
          videoPath,
          results,
          words,
          plannedDraftIds: exportableDrafts.map((draft) => draft.id),
          remainingDraftIds: remainingDrafts.map((draft) => draft.id),
          stopped,
        });
      } catch (err) {
        console.error('Clip batch manifest failed:', err);
        manifestWarning = "Clips were exported, but ScriptCut couldn't save the batch manifest.";
      }
      const warningDetails = [
        ...results.flatMap((result) => result.warnings || []),
        pausedForDraftChange ? 'Batch paused because a planned clip changed and needs to be prepared again.' : '',
        manifestWarning,
      ].filter(Boolean);
      setCreatorNotice({
        tone: failedCount > 0 || pausedForDraftChange || manifestWarning ? 'warning' : 'success',
        title: successCount > 0
          ? `${successCount} clip${successCount === 1 ? '' : 's'} ready`
          : stopped
            ? 'Export stopped'
            : 'Export finished',
        message: `${successCount} exported, ${failedCount} failed.${stopped ? ` ${remainingDrafts.length} remaining.` : ''}${manifestPath ? ` Manifest saved to ${manifestPath}.` : ''}`,
        technicalDetails: warningDetails.length > 0 ? warningDetails.join('\n') : undefined,
        onDismiss: () => setCreatorNotice(null),
      });
    } catch (err) {
      console.error(err);
      setCreatorNotice({ ...getCreatorErrorPresentation('clip-action', err), onDismiss: () => setCreatorNotice(null) });
    } finally {
      setExportingDraftId(null);
      setBatchExporting(false);
      stopBatchExportRef.current = false;
      setBatchExportProgress((current) => ({ ...current, stopping: false }));
    }
  }, [
    clipDrafts,
    clipExportDirectory,
    exportBusy,
    handleExportClip,
    setCreatorNotice,
    videoPath,
    words,
  ]);

  const stopBatchExport = useCallback(() => {
    stopBatchExportRef.current = true;
    setBatchExportProgress((current) => ({ ...current, stopping: true }));
  }, []);

  return {
    batchExportProgress,
    cancelDraftExport,
    chooseClipExportDirectory,
    clearClipExportAttempt,
    clipExportDirectory,
    clipExportJobs,
    clipExportOutputs,
    exportBusy,
    exportCandidateDrafts,
    exportingDraftId,
    handleExportAllDrafts,
    handleExportDraft,
    isBatchExporting,
    retryDraftExport,
    stopBatchExport,
    updateClipExportDirectory,
  };
}
