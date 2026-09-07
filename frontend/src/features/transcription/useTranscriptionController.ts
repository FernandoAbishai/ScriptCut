import { useCallback, useRef, useState } from 'react';
import { useEditorStore } from '../../store/editorStore';
import type { TranscriptionResult } from '../../types/project';
import {
  createTranscriptionRunContext,
  isCurrentTranscriptionRun as isCurrentTranscriptionRunContext,
  type TranscriptionRunContext,
} from '../../utils/transcriptionLifecycle';
import type { TranscriptionEngine } from '../../utils/transcriptionModels';

type TranscriptionLog = {
  time: string;
  message: string;
};

type BackendJob<T> = {
  status: 'queued' | 'running' | 'canceling' | 'succeeded' | 'failed' | 'canceled';
  progress: number;
  message: string;
  logs?: TranscriptionLog[];
  result?: T;
  error?: string;
};

type UseTranscriptionControllerOptions<Intent> = {
  backendUrl: string;
  transcriptionEngine: TranscriptionEngine;
  transcriptionModel: string;
  onCompleted: (intent: Intent | null) => void;
};

export function useTranscriptionController<Intent>({
  backendUrl,
  transcriptionEngine,
  transcriptionModel,
  onCompleted,
}: UseTranscriptionControllerOptions<Intent>) {
  const setTranscription = useEditorStore((state) => state.setTranscription);
  const setTranscribing = useEditorStore((state) => state.setTranscribing);

  const [transcriptionMessage, setTranscriptionMessage] = useState('');
  const [transcriptionError, setTranscriptionError] = useState('');
  const [transcriptionLogs, setTranscriptionLogs] = useState<TranscriptionLog[]>([]);
  const [lastTranscriptionJobId, setLastTranscriptionJobId] = useState('');
  const [lastTranscriptionPath, setLastTranscriptionPath] = useState('');
  const transcriptionIntentRef = useRef<Intent | null>(null);
  const transcriptionRunEpochRef = useRef(0);
  const transcriptionRunRef = useRef<TranscriptionRunContext<Intent | null> | null>(null);

  const isCurrentTranscriptionRun = useCallback(
    (run: TranscriptionRunContext<Intent | null>) =>
      isCurrentTranscriptionRunContext(
        run,
        transcriptionRunEpochRef.current,
        useEditorStore.getState().videoPath,
      ),
    [],
  );

  const invalidateTranscriptionRun = useCallback(() => {
    transcriptionRunEpochRef.current += 1;
    transcriptionRunRef.current = null;
    transcriptionIntentRef.current = null;
    setLastTranscriptionPath('');
    setLastTranscriptionJobId('');
    setTranscriptionMessage('');
    setTranscriptionError('');
    setTranscriptionLogs([]);
    setTranscribing(false, 0);
  }, [setTranscribing]);

  const clearTranscriptionError = useCallback(() => {
    setTranscriptionError('');
  }, []);

  const beginTranscriptionRun = useCallback((path: string, intent?: Intent) => {
    const resolvedIntent = intent ?? transcriptionIntentRef.current;
    const run = createTranscriptionRunContext(
      transcriptionRunEpochRef.current + 1,
      path,
      resolvedIntent,
    );
    transcriptionRunEpochRef.current = run.epoch;
    transcriptionRunRef.current = run;
    transcriptionIntentRef.current = resolvedIntent;
    return run;
  }, []);

  const completeTranscription = useCallback((
    data: TranscriptionResult,
    run: TranscriptionRunContext<Intent | null>,
  ) => {
    if (!isCurrentTranscriptionRun(run)) return;
    setTranscription(data);
    if (!isCurrentTranscriptionRun(run)) return;
    onCompleted(run.intent);
  }, [isCurrentTranscriptionRun, onCompleted, setTranscription]);

  const pollTranscriptionJob = useCallback(async (
    jobId: string,
    run: TranscriptionRunContext<Intent | null>,
  ): Promise<TranscriptionResult | null> => {
    for (;;) {
      await new Promise((resolve) => window.setTimeout(resolve, 700));
      if (!isCurrentTranscriptionRun(run)) return null;
      const res = await fetch(`${backendUrl}/jobs/${jobId}`);
      if (!isCurrentTranscriptionRun(run)) return null;
      if (!res.ok) throw new Error(`Could not read transcription job: ${res.statusText}`);

      const job = (await res.json()) as BackendJob<TranscriptionResult>;
      if (!isCurrentTranscriptionRun(run)) return null;
      setTranscriptionMessage(job.message || job.status);
      setTranscriptionLogs(job.logs || []);
      setTranscribing(
        job.status === 'queued' || job.status === 'running' || job.status === 'canceling',
        job.progress,
      );

      if (job.status === 'succeeded') {
        if (!job.result) throw new Error('Transcription job finished without a result');
        return job.result;
      }
      if (job.status === 'failed' || job.status === 'canceled') {
        throw new Error(job.error || job.message || `Transcription ${job.status}`);
      }
    }
  }, [backendUrl, isCurrentTranscriptionRun, setTranscribing]);

  const transcribeVideo = useCallback(async (path: string, intent?: Intent) => {
    if (useEditorStore.getState().videoPath !== path) return;
    const run = beginTranscriptionRun(path, intent);
    setLastTranscriptionPath(path);
    setTranscribing(true, 0);
    setTranscriptionMessage('Preparing your transcript');
    setTranscriptionError('');
    setTranscriptionLogs([]);
    setLastTranscriptionJobId('');
    try {
      const res = await fetch(`${backendUrl}/jobs/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: path, engine: transcriptionEngine, model: transcriptionModel }),
      });
      if (!isCurrentTranscriptionRun(run)) return;
      if (!res.ok) {
        let detail = res.statusText;
        try {
          const errorData = await res.json();
          detail = errorData.detail || JSON.stringify(errorData);
        } catch {
          // Keep the HTTP status text when the backend response is not JSON.
        }
        throw new Error(`Transcription start failed: ${detail}`);
      }
      const { job_id: jobId } = await res.json();
      if (!isCurrentTranscriptionRun(run)) return;
      setLastTranscriptionJobId(jobId);
      const data = await pollTranscriptionJob(jobId, run);
      if (!data || !isCurrentTranscriptionRun(run)) return;
      completeTranscription(data, run);
    } catch (err) {
      if (!isCurrentTranscriptionRun(run)) return;
      console.error('Transcription error:', err);
      const message = err instanceof Error ? err.message : String(err);
      setTranscriptionError(message.toLowerCase().includes('canceled') ? 'Transcription canceled' : message);
    } finally {
      if (isCurrentTranscriptionRun(run)) {
        setTranscriptionMessage('');
        setTranscribing(false);
      }
    }
  }, [
    backendUrl,
    beginTranscriptionRun,
    completeTranscription,
    isCurrentTranscriptionRun,
    pollTranscriptionJob,
    setTranscribing,
    transcriptionEngine,
    transcriptionModel,
  ]);

  const cancelTranscription = useCallback(async () => {
    const run = transcriptionRunRef.current;
    const jobId = lastTranscriptionJobId;
    if (!run || !jobId || !isCurrentTranscriptionRun(run)) return;
    try {
      await fetch(`${backendUrl}/jobs/${jobId}/cancel`, { method: 'POST' });
      if (!isCurrentTranscriptionRun(run)) return;
      setTranscriptionMessage('Cancel requested');
    } catch (err) {
      if (!isCurrentTranscriptionRun(run)) return;
      console.error('Transcription cancel error:', err);
      setTranscriptionError(err instanceof Error ? err.message : String(err));
      setTranscribing(false);
    }
  }, [backendUrl, isCurrentTranscriptionRun, lastTranscriptionJobId, setTranscribing]);

  const retryTranscription = useCallback(async () => {
    const previousRun = transcriptionRunRef.current;
    const previousJobId = lastTranscriptionJobId;
    if (!previousRun || !previousJobId || !isCurrentTranscriptionRun(previousRun)) return;
    const run = beginTranscriptionRun(previousRun.mediaPath, previousRun.intent ?? undefined);
    setTranscriptionError('');
    setTranscriptionLogs([]);
    setTranscriptionMessage('Retrying transcription');
    setLastTranscriptionJobId('');
    setTranscribing(true, 1);
    try {
      const res = await fetch(`${backendUrl}/jobs/${previousJobId}/retry`, { method: 'POST' });
      if (!isCurrentTranscriptionRun(run)) return;
      if (!res.ok) throw new Error(`Retry failed: ${res.statusText}`);
      const { job_id: jobId } = await res.json();
      if (!isCurrentTranscriptionRun(run)) return;
      setLastTranscriptionJobId(jobId);
      const data = await pollTranscriptionJob(jobId, run);
      if (!data || !isCurrentTranscriptionRun(run)) return;
      completeTranscription(data, run);
    } catch (err) {
      if (!isCurrentTranscriptionRun(run)) return;
      console.error('Transcription retry error:', err);
      setTranscriptionError(err instanceof Error ? err.message : String(err));
    } finally {
      if (isCurrentTranscriptionRun(run)) {
        setTranscriptionMessage('');
        setTranscribing(false);
      }
    }
  }, [
    backendUrl,
    beginTranscriptionRun,
    completeTranscription,
    isCurrentTranscriptionRun,
    lastTranscriptionJobId,
    pollTranscriptionJob,
    setTranscribing,
  ]);

  const startTranscriptionWithSettings = useCallback(async () => {
    if (!lastTranscriptionPath || useEditorStore.getState().videoPath !== lastTranscriptionPath) return;
    await transcribeVideo(lastTranscriptionPath, transcriptionIntentRef.current ?? undefined);
  }, [lastTranscriptionPath, transcribeVideo]);

  return {
    cancelTranscription,
    clearTranscriptionError,
    invalidateTranscriptionRun,
    lastTranscriptionJobId,
    retryTranscription,
    startTranscriptionWithSettings,
    transcribeVideo,
    transcriptionError,
    transcriptionLogs,
    transcriptionMessage,
  };
}
