import { useCallback, useEffect, useRef, useState } from 'react';
import { useAIStore } from '../../store/aiStore';

export type AIJob<T> = {
  id: string;
  kind: string;
  status: 'queued' | 'running' | 'canceling' | 'succeeded' | 'failed' | 'canceled';
  progress: number;
  message: string;
  logs?: Array<{ time: string; message: string }>;
  result?: T;
  error?: string;
};

export type AIJobContext = {
  label: string;
  draftId?: string;
  inputFingerprint?: string;
};

type AIJobRunContext = {
  id: number;
  workspaceEpoch: number;
};

export type ActiveAIJob = AIJob<unknown> & AIJobContext & {
  workspaceEpoch: number;
  runId: number;
};

type UseAIJobControllerOptions = {
  backendUrl: string;
};

export function useAIJobController({ backendUrl }: UseAIJobControllerOptions) {
  const clipWorkspaceEpoch = useAIStore((state) => state.clipWorkspaceEpoch);
  const setProcessing = useAIStore((state) => state.setProcessing);
  const [activeAIJob, setActiveAIJob] = useState<ActiveAIJob | null>(null);
  const aiJobRunEpochRef = useRef(0);
  const activeAIJobRunRef = useRef<AIJobRunContext | null>(null);

  const isCurrentAIJobRun = useCallback((run: AIJobRunContext) => {
    const activeRun = activeAIJobRunRef.current;
    return (
      activeRun?.id === run.id &&
      activeRun.workspaceEpoch === run.workspaceEpoch &&
      useAIStore.getState().clipWorkspaceEpoch === run.workspaceEpoch
    );
  }, []);

  const beginAIJobRun = useCallback(() => {
    const workspaceEpoch = useAIStore.getState().clipWorkspaceEpoch;
    const activeRun = activeAIJobRunRef.current;
    if (activeRun?.workspaceEpoch === workspaceEpoch) {
      throw new Error('Another AI action is still running. Wait for it to finish or cancel it first.');
    }
    const run = {
      id: aiJobRunEpochRef.current + 1,
      workspaceEpoch,
    };
    aiJobRunEpochRef.current = run.id;
    activeAIJobRunRef.current = run;
    return run;
  }, []);

  const finishAIJobRun = useCallback((run: AIJobRunContext) => {
    if (activeAIJobRunRef.current?.id === run.id) {
      activeAIJobRunRef.current = null;
    }
  }, []);

  useEffect(() => {
    setActiveAIJob((current) =>
      current && current.workspaceEpoch !== clipWorkspaceEpoch ? null : current,
    );
    if (activeAIJobRunRef.current?.workspaceEpoch !== clipWorkspaceEpoch) {
      activeAIJobRunRef.current = null;
    }
  }, [clipWorkspaceEpoch]);

  const pollAIJob = useCallback(
    async <T,>(jobId: string, fallbackMessage: string, context: AIJobContext, run: AIJobRunContext) => {
      for (;;) {
        await new Promise((resolve) => window.setTimeout(resolve, 700));
        if (!isCurrentAIJobRun(run)) throw new Error('The media workspace changed while this AI job was running.');
        let jobRes: Response;
        try {
          jobRes = await fetch(`${backendUrl}/jobs/${jobId}`);
        } catch {
          if (!isCurrentAIJobRun(run)) throw new Error('The media workspace changed while this AI job was running.');
          setActiveAIJob((current) =>
            current?.runId === run.id
              ? { ...current, message: 'Connection interrupted; checking AI job status...' }
              : current,
          );
          setProcessing(true, 'Connection interrupted; checking AI job status...');
          continue;
        }
        if (!isCurrentAIJobRun(run)) throw new Error('The media workspace changed while this AI job was running.');
        if (!jobRes.ok) {
          if (jobRes.status === 404) throw new Error(`${fallbackMessage} job is no longer available`);
          setActiveAIJob((current) =>
            current?.runId === run.id
              ? { ...current, message: 'AI job status unavailable; retrying...' }
              : current,
          );
          setProcessing(true, 'AI job status unavailable; retrying...');
          continue;
        }
        let job: AIJob<T>;
        try {
          job = (await jobRes.json()) as AIJob<T>;
        } catch {
          if (!isCurrentAIJobRun(run)) throw new Error('The media workspace changed while this AI job was running.');
          setActiveAIJob((current) =>
            current?.runId === run.id
              ? { ...current, message: 'AI job status was unreadable; retrying...' }
              : current,
          );
          setProcessing(true, 'AI job status was unreadable; retrying...');
          continue;
        }
        if (!isCurrentAIJobRun(run)) throw new Error('The media workspace changed while this AI job was running.');
        setActiveAIJob({ ...job, ...context, workspaceEpoch: run.workspaceEpoch, runId: run.id });
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
    [backendUrl, isCurrentAIJobRun, setProcessing],
  );

  const startAIJob = useCallback(
    async <T,>(
      path: string,
      body: unknown,
      fallbackMessage: string,
      context?: Partial<AIJobContext>,
      processingMessage = fallbackMessage,
    ) => {
      const run = beginAIJobRun();
      setProcessing(true, processingMessage);
      try {
        const startRes = await fetch(`${backendUrl}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!isCurrentAIJobRun(run)) throw new Error('The media workspace changed while this AI job was starting.');
        if (!startRes.ok) {
          const errorData = await startRes.json().catch(() => null);
          if (!isCurrentAIJobRun(run)) throw new Error('The media workspace changed while this AI job was starting.');
          throw new Error(errorData?.detail || `${fallbackMessage} start failed`);
        }

        const { job_id: jobId } = await startRes.json();
        if (!isCurrentAIJobRun(run)) throw new Error('The media workspace changed while this AI job was starting.');
        const jobContext = {
          label: context?.label || fallbackMessage,
          draftId: context?.draftId,
          inputFingerprint: context?.inputFingerprint,
        };
        setActiveAIJob({
          id: jobId,
          kind: path.replace('/jobs/', ''),
          status: 'queued',
          progress: 0,
          message: 'Queued',
          logs: [],
          ...jobContext,
          workspaceEpoch: run.workspaceEpoch,
          runId: run.id,
        });
        return await pollAIJob<T>(jobId, fallbackMessage, jobContext, run);
      } finally {
        if (isCurrentAIJobRun(run)) {
          finishAIJobRun(run);
          setProcessing(false);
        }
      }
    },
    [backendUrl, beginAIJobRun, finishAIJobRun, isCurrentAIJobRun, pollAIJob, setProcessing],
  );

  const cancelAIJob = useCallback(async () => {
    const job = activeAIJob;
    const run = activeAIJobRunRef.current;
    if (!job || !run || !['queued', 'running'].includes(job.status)) return;
    if (job.workspaceEpoch !== run.workspaceEpoch || job.runId !== run.id || !isCurrentAIJobRun(run)) return;
    const res = await fetch(`${backendUrl}/jobs/${job.id}/cancel`, { method: 'POST' });
    if (!isCurrentAIJobRun(run)) return;
    if (res.ok) {
      const canceledJob = (await res.json()) as AIJob<unknown>;
      if (!isCurrentAIJobRun(run)) return;
      setActiveAIJob({
        ...canceledJob,
        label: job.label,
        draftId: job.draftId,
        inputFingerprint: job.inputFingerprint,
        workspaceEpoch: job.workspaceEpoch,
        runId: job.runId,
      });
    }
  }, [activeAIJob, backendUrl, isCurrentAIJobRun]);

  const retryAIJob = useCallback(async () => {
    const sourceJob = activeAIJob;
    if (!sourceJob || !['failed', 'canceled'].includes(sourceJob.status)) return null;
    if (sourceJob.workspaceEpoch !== useAIStore.getState().clipWorkspaceEpoch) {
      setActiveAIJob(null);
      return null;
    }

    const run = beginAIJobRun();
    setProcessing(true, `Retrying ${sourceJob.label}...`);
    try {
      const retryRes = await fetch(`${backendUrl}/jobs/${sourceJob.id}/retry`, { method: 'POST' });
      if (!isCurrentAIJobRun(run)) return null;
      if (!retryRes.ok) throw new Error(`Retry failed: ${retryRes.statusText}`);
      const { job_id: jobId } = await retryRes.json();
      if (!isCurrentAIJobRun(run)) return null;
      const context = {
        label: sourceJob.label,
        draftId: sourceJob.draftId,
        inputFingerprint: sourceJob.inputFingerprint,
      };
      setActiveAIJob({
        id: jobId,
        kind: sourceJob.kind,
        status: 'queued',
        progress: 0,
        message: 'Queued',
        logs: [],
        ...context,
        workspaceEpoch: run.workspaceEpoch,
        runId: run.id,
      });
      const result = await pollAIJob<unknown>(jobId, sourceJob.label, context, run);
      if (!isCurrentAIJobRun(run)) return null;
      return { sourceJob, result };
    } finally {
      if (isCurrentAIJobRun(run)) {
        finishAIJobRun(run);
        setProcessing(false);
      }
    }
  }, [activeAIJob, backendUrl, beginAIJobRun, finishAIJobRun, isCurrentAIJobRun, pollAIJob, setProcessing]);

  const clearActiveAIJob = useCallback(() => {
    setActiveAIJob(null);
  }, []);

  return {
    activeAIJob,
    cancelAIJob,
    clearActiveAIJob,
    retryAIJob,
    startAIJob,
  };
}
