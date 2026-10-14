import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useEditorStore } from '../../store/editorStore';
import type { ExportOptions } from '../../types/project';

export type FullVideoExportContext = {
  mediaPath: string;
  workspaceRevision: number;
  preset: ExportOptions['preset'];
  format: ExportOptions['format'];
};

type FullVideoExportRun = {
  id: number;
  context: FullVideoExportContext;
};

export type FullVideoExportJobResult = {
  output_path?: string;
  srt_path?: string;
  file_capability?: string;
  srt_file_capability?: string;
  warnings?: string[];
};

export type FullVideoExportJob = {
  id: string;
  status: 'queued' | 'running' | 'canceling' | 'succeeded' | 'failed' | 'canceled';
  progress: number;
  message: string;
  logs?: Array<{ time: string; message: string }>;
  result?: FullVideoExportJobResult;
  error?: string;
  runId: number;
  context: FullVideoExportContext;
};

export type FullVideoExportCompletion = {
  context: FullVideoExportContext;
  result: FullVideoExportJobResult;
};

type PendingFullVideoExportCompletion = {
  jobId: string;
  completion: FullVideoExportCompletion;
};

type StartFullVideoExportInput = {
  body: unknown;
  context: FullVideoExportContext;
};

type UseFullVideoExportControllerOptions = {
  backendUrl: string;
  workspaceRevision: number;
};

export function useFullVideoExportController({ backendUrl, workspaceRevision }: UseFullVideoExportControllerOptions) {
  const currentMediaPath = useEditorStore((state) => state.videoPath);
  const mirroredIsExporting = useEditorStore((state) => state.isExporting);
  const mirroredExportProgress = useEditorStore((state) => state.exportProgress);
  const setExporting = useEditorStore((state) => state.setExporting);
  const [trackedJob, setTrackedJob] = useState<FullVideoExportJob | null>(null);
  const [exportMessage, setExportMessage] = useState('');
  const [exportLogs, setExportLogs] = useState<Array<{ time: string; message: string }>>([]);
  const [failure, setFailure] = useState<{ message: string; context: FullVideoExportContext } | null>(null);
  const [pendingCompletion, setPendingCompletion] = useState<PendingFullVideoExportCompletion | null>(null);
  const runEpochRef = useRef(0);
  const activeRunRef = useRef<FullVideoExportRun | null>(null);
  const activeProgressRef = useRef(0);
  const mountedRef = useRef(true);
  const currentWorkspaceRef = useRef({ mediaPath: currentMediaPath, workspaceRevision });
  currentWorkspaceRef.current = { mediaPath: currentMediaPath, workspaceRevision };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeRunRef.current = null;
    };
  }, []);

  const isCurrentRun = useCallback((run: FullVideoExportRun) => (
    mountedRef.current && activeRunRef.current?.id === run.id
  ), []);

  const isCurrentWorkspace = useCallback((context: FullVideoExportContext) => (
    context.mediaPath === currentWorkspaceRef.current.mediaPath
    && context.workspaceRevision === currentWorkspaceRef.current.workspaceRevision
  ), []);

  const beginRun = useCallback((context: FullVideoExportContext) => {
    if (activeRunRef.current) {
      throw new Error('Another full-video export is still running. Wait for it to finish or cancel it first.');
    }
    const run = { id: runEpochRef.current + 1, context };
    runEpochRef.current = run.id;
    activeRunRef.current = run;
    activeProgressRef.current = 1;
    return run;
  }, []);

  const finishRun = useCallback((run: FullVideoExportRun, succeeded: boolean) => {
    if (!isCurrentRun(run)) return;
    activeRunRef.current = null;
    setExporting(false, succeeded ? 100 : 0);
    if (!isCurrentWorkspace(run.context)) {
      setTrackedJob(null);
      setExportMessage('');
      setExportLogs([]);
      setFailure(null);
      setPendingCompletion(null);
    }
  }, [isCurrentRun, isCurrentWorkspace, setExporting]);

  useLayoutEffect(() => {
    const run = activeRunRef.current;
    if (!run) {
      if (trackedJob && !isCurrentWorkspace(trackedJob.context)) {
        setTrackedJob(null);
        setExportMessage('');
        setExportLogs([]);
      }
      if (failure && !isCurrentWorkspace(failure.context)) setFailure(null);
      if (pendingCompletion && !isCurrentWorkspace(pendingCompletion.completion.context)) {
        setPendingCompletion(null);
      }
      return;
    }
    if (!mirroredIsExporting || mirroredExportProgress !== activeProgressRef.current) {
      setExporting(true, activeProgressRef.current);
    }
  }, [
    currentMediaPath,
    failure,
    isCurrentWorkspace,
    mirroredExportProgress,
    mirroredIsExporting,
    pendingCompletion,
    setExporting,
    trackedJob,
    workspaceRevision,
  ]);

  const pollExportJob = useCallback(async (jobId: string, run: FullVideoExportRun) => {
    for (;;) {
      await new Promise((resolve) => window.setTimeout(resolve, 700));
      if (!isCurrentRun(run)) return null;

      let res: Response;
      try {
        res = await fetch(`${backendUrl}/jobs/${jobId}`);
      } catch {
        if (!isCurrentRun(run)) return null;
        setExportMessage('Connection interrupted; checking export status...');
        setExporting(true, activeProgressRef.current);
        continue;
      }

      if (!isCurrentRun(run)) return null;
      if (!res.ok) {
        if (res.status === 404) throw new Error('Export job is no longer available');
        setExportMessage('Export status unavailable; retrying...');
        setExporting(true, activeProgressRef.current);
        continue;
      }

      let job: Omit<FullVideoExportJob, 'runId' | 'context'>;
      try {
        job = await res.json() as Omit<FullVideoExportJob, 'runId' | 'context'>;
      } catch {
        if (!isCurrentRun(run)) return null;
        setExportMessage('Export status was unreadable; retrying...');
        setExporting(true, activeProgressRef.current);
        continue;
      }

      if (!isCurrentRun(run)) return null;
      activeProgressRef.current = job.progress;
      const tracked = { ...job, runId: run.id, context: run.context };
      setTrackedJob(tracked);
      setExportMessage(job.message || job.status);
      setExportLogs(job.logs || []);
      setExporting(
        job.status === 'queued' || job.status === 'running' || job.status === 'canceling',
        job.progress,
      );

      if (job.status === 'succeeded') {
        return { context: run.context, result: job.result || {} } satisfies FullVideoExportCompletion;
      }
      if (job.status === 'failed' || job.status === 'canceled') {
        throw new Error(job.error || job.message || `Export ${job.status}`);
      }
    }
  }, [backendUrl, isCurrentRun, setExporting]);

  const startExportJob = useCallback(async ({ body, context }: StartFullVideoExportInput) => {
    if (!isCurrentWorkspace(context)) return null;
    const run = beginRun(context);
    let succeeded = false;
    setTrackedJob(null);
    setExportMessage('Starting export');
    setExportLogs([]);
    setFailure(null);
    setExporting(true, 1);

    try {
      const res = await fetch(`${backendUrl}/jobs/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!isCurrentRun(run)) return null;
      if (!res.ok) {
        let detail = res.statusText;
        try {
          const data = await res.json() as { detail?: unknown };
          if (typeof data.detail === 'string') detail = data.detail;
          else if (data.detail !== undefined) detail = JSON.stringify(data.detail);
        } catch {
          // Keep the HTTP status text if the backend did not return JSON.
        }
        throw new Error(`Export start failed: ${detail}`);
      }
      const { job_id: jobId } = await res.json() as { job_id: string };
      if (!isCurrentRun(run)) return null;
      setTrackedJob({
        id: jobId,
        status: 'queued',
        progress: 0,
        message: 'Queued',
        logs: [],
        runId: run.id,
        context: run.context,
      });
      const completion = await pollExportJob(jobId, run);
      if (!completion || !isCurrentRun(run)) return null;
      succeeded = true;
      setFailure(null);
      if (isCurrentWorkspace(run.context)) setPendingCompletion({ jobId, completion });
      return completion;
    } catch (err) {
      if (isCurrentRun(run)) {
        setFailure({ message: err instanceof Error ? err.message : String(err), context: run.context });
      }
      throw err;
    } finally {
      finishRun(run, succeeded);
    }
  }, [backendUrl, beginRun, finishRun, isCurrentRun, isCurrentWorkspace, pollExportJob, setExporting]);

  const cancelExportJob = useCallback(async () => {
    const run = activeRunRef.current;
    const job = trackedJob;
    if (!run || !job || !['queued', 'running'].includes(job.status)) return;
    if (job.runId !== run.id || !isCurrentRun(run)) return;

    const res = await fetch(`${backendUrl}/jobs/${job.id}/cancel`, { method: 'POST' });
    if (!isCurrentRun(run)) return;
    if (!res.ok) {
      const error = new Error(`Cancel failed: ${res.statusText}`);
      setFailure({ message: error.message, context: run.context });
      throw error;
    }
    const canceledJob = await res.json() as Omit<FullVideoExportJob, 'runId' | 'context'>;
    if (!isCurrentRun(run)) return;
    setTrackedJob({ ...canceledJob, runId: run.id, context: run.context });
    setExportMessage(canceledJob.message || 'Cancel requested');
    setExportLogs(canceledJob.logs || []);
  }, [backendUrl, isCurrentRun, trackedJob]);

  const retryExportJob = useCallback(async () => {
    const sourceJob = trackedJob;
    if (!sourceJob || !['failed', 'canceled'].includes(sourceJob.status)) return null;
    if (!isCurrentWorkspace(sourceJob.context)) return null;

    const run = beginRun(sourceJob.context);
    let succeeded = false;
    setExportMessage('Retrying export');
    setExportLogs([]);
    setFailure(null);
    setExporting(true, 1);

    try {
      const res = await fetch(`${backendUrl}/jobs/${sourceJob.id}/retry`, { method: 'POST' });
      if (!isCurrentRun(run)) return null;
      if (!res.ok) throw new Error(`Retry failed: ${res.statusText}`);
      const { job_id: jobId } = await res.json() as { job_id: string };
      if (!isCurrentRun(run)) return null;
      setTrackedJob({
        id: jobId,
        status: 'queued',
        progress: 0,
        message: 'Queued',
        logs: [],
        runId: run.id,
        context: run.context,
      });
      const completion = await pollExportJob(jobId, run);
      if (!completion || !isCurrentRun(run)) return null;
      succeeded = true;
      setFailure(null);
      if (isCurrentWorkspace(run.context)) setPendingCompletion({ jobId, completion });
      return completion;
    } catch (err) {
      if (isCurrentRun(run)) {
        setFailure({ message: err instanceof Error ? err.message : String(err), context: run.context });
      }
      throw err;
    } finally {
      finishRun(run, succeeded);
    }
  }, [backendUrl, beginRun, finishRun, isCurrentRun, isCurrentWorkspace, pollExportJob, setExporting, trackedJob]);

  const exportJobId = trackedJob?.id || '';
  const exportJobStatus = trackedJob?.status || null;
  const canRetryExport = !!trackedJob && ['failed', 'canceled'].includes(trackedJob.status)
    && isCurrentWorkspace(trackedJob.context);
  const exportFailure = failure && isCurrentWorkspace(failure.context) ? failure.message : '';
  const visiblePendingCompletion = pendingCompletion
    && isCurrentWorkspace(pendingCompletion.completion.context)
    ? pendingCompletion
    : null;
  const acknowledgeCompletion = useCallback((jobId: string) => {
    setPendingCompletion((current) => current?.jobId === jobId ? null : current);
  }, []);

  return {
    acknowledgeCompletion,
    cancelExportJob,
    canRetryExport,
    exportFailure,
    exportJobId,
    exportJobStatus,
    exportLogs,
    exportMessage,
    pendingCompletion: visiblePendingCompletion,
    retryExportJob,
    startExportJob,
    workspaceRevision,
  };
}

export type FullVideoExportController = ReturnType<typeof useFullVideoExportController>;
