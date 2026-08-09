import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import TranscriptionOptions from './TranscriptionOptions';
import {
  classifyTranscriptionFailure,
  getTranscriptionFailureCopy,
} from '../utils/transcriptionUx';
import type { TranscriptionEngine, TranscriptionEngineStatus } from '../utils/transcriptionModels';
import { RELEASE_LINKS } from '../utils/releaseInfo';

type TranscriptionLog = { time: string; message: string };

type TranscriptionStatusProps = {
  isTranscribing: boolean;
  progress: number;
  message: string;
  error: string;
  logs: TranscriptionLog[];
  lastJobId: string;
  transcriptionEngine: TranscriptionEngine;
  onEngineChange: (engine: TranscriptionEngine) => void;
  transcriptionModel: string;
  onModelChange: (model: string) => void;
  transcriptionEngineStatus: TranscriptionEngineStatus | null;
  onCancel: () => void | Promise<void>;
  onRetry?: () => void | Promise<void>;
  onUseAutomatic: () => void;
  onStartWithSettings?: () => void | Promise<void>;
};

export default function TranscriptionStatus({
  isTranscribing,
  progress,
  message,
  error,
  logs,
  lastJobId,
  transcriptionEngine,
  onEngineChange,
  transcriptionModel,
  onModelChange,
  transcriptionEngineStatus,
  onCancel,
  onRetry,
  onUseAutomatic,
  onStartWithSettings,
}: TranscriptionStatusProps) {
  const [showOptions, setShowOptions] = useState(false);
  const [settingsChanged, setSettingsChanged] = useState(false);
  const percent = Math.round(progress);

  useEffect(() => {
    setSettingsChanged(false);
  }, [lastJobId, error]);

  const handleEngineChange = (engine: TranscriptionEngine) => {
    onEngineChange(engine);
    setSettingsChanged(true);
  };

  const handleModelChange = (model: string) => {
    onModelChange(model);
    setSettingsChanged(true);
  };

  const handleUseAutomatic = () => {
    onUseAutomatic();
    setSettingsChanged(true);
    setShowOptions(true);
  };

  if (isTranscribing) {
    return (
      <section className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center" aria-live="polite">
        <Loader2 className="h-8 w-8 animate-spin text-editor-accent" />
        <div>
          <h2 className="text-sm font-medium text-editor-text">Preparing your transcript</h2>
          <p className="mt-1 text-xs text-editor-text-muted">ScriptCut is transcribing your media locally.</p>
        </div>
        <div className="w-full max-w-md">
          <div className="mb-1 flex justify-between text-[11px] text-editor-text-muted">
            <span>Progress</span>
            <span>{percent}%</span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-editor-border"
            role="progressbar"
            aria-label="Transcription progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <div className="h-full rounded-full bg-editor-accent transition-all" style={{ width: `${percent}%` }} />
          </div>
        </div>
        <button
          type="button"
          onClick={() => void onCancel()}
          disabled={!lastJobId}
          className="rounded bg-editor-border px-3 py-2 text-xs text-editor-text-muted hover:bg-editor-surface hover:text-editor-text disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancel
        </button>
        <details className="w-full max-w-md rounded border border-editor-border bg-editor-surface p-2 text-left text-[10px] text-editor-text-muted">
          <summary className="cursor-pointer text-editor-text">Technical details</summary>
          <div className="mt-2 max-h-32 space-y-1 overflow-y-auto">
            <div className="break-words">{message || 'Waiting for the transcription job to start.'}</div>
            {logs.slice(-8).map((entry, index) => (
              <div key={`${entry.time}-${index}`} className="break-words">
                {new Date(entry.time).toLocaleTimeString()} - {entry.message}
              </div>
            ))}
          </div>
        </details>
      </section>
    );
  }

  const failureKind = classifyTranscriptionFailure(error);
  const failureCopy = getTranscriptionFailureCopy(failureKind);
  const isCanceled = failureKind === 'canceled';

  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-3 overflow-y-auto p-6 text-center" role="alert" aria-live="assertive">
      <div className={`w-full max-w-md rounded border p-4 text-left ${isCanceled ? 'border-editor-border bg-editor-surface' : 'border-editor-danger/30 bg-editor-danger/10'}`}>
        <h2 className={`text-sm font-medium ${isCanceled ? 'text-editor-text' : 'text-editor-danger'}`}>{failureCopy.title}</h2>
        <p className="mt-1 text-xs leading-5 text-editor-text-muted">{failureCopy.summary}</p>
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {!settingsChanged && lastJobId && onRetry && (
          <button
            type="button"
            onClick={() => void onRetry()}
            className="rounded bg-editor-accent px-3 py-2 text-sm font-medium hover:bg-editor-accent-hover"
          >
            Try Again
          </button>
        )}
        {failureKind === 'engine-unavailable' && transcriptionEngine !== 'auto' && (
          <button
            type="button"
            onClick={handleUseAutomatic}
            className="rounded border border-editor-border px-3 py-2 text-sm text-editor-text hover:bg-editor-surface"
          >
            Use Automatic
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowOptions((open) => !open)}
          aria-expanded={showOptions}
          aria-controls="transcription-options"
          className="rounded border border-editor-border px-3 py-2 text-sm text-editor-text hover:bg-editor-surface"
        >
          Transcription Options
        </button>
      </div>

      {showOptions && (
        <div
          id="transcription-options"
          className="w-full max-w-md rounded border border-editor-border bg-editor-surface p-3 text-left"
        >
          <TranscriptionOptions
            transcriptionEngine={transcriptionEngine}
            onEngineChange={handleEngineChange}
            transcriptionModel={transcriptionModel}
            onModelChange={handleModelChange}
            transcriptionEngineStatus={transcriptionEngineStatus}
            onUseAutomatic={handleUseAutomatic}
          />
          {onStartWithSettings && (
            <button
              type="button"
              onClick={() => void onStartWithSettings()}
              className="mt-3 w-full rounded bg-editor-accent px-3 py-2 text-sm font-medium hover:bg-editor-accent-hover"
            >
              Start With These Settings
            </button>
          )}
        </div>
      )}

      {failureKind === 'no-engine' && (
        <a
          href={RELEASE_LINKS.installGuide}
          target="_blank"
          rel="noreferrer"
          className="rounded border border-editor-border px-3 py-2 text-sm text-editor-text hover:bg-editor-surface"
        >
          Open Setup Guide
        </a>
      )}

      <details className="w-full max-w-md rounded border border-editor-border bg-editor-surface p-2 text-left text-[10px] text-editor-text-muted">
        <summary className="cursor-pointer text-editor-text">Technical details</summary>
        <div className="mt-2 max-h-32 space-y-1 overflow-y-auto">
          <div className="break-words">{error || 'No additional error details were provided.'}</div>
          {logs.slice(-8).map((entry, index) => (
            <div key={`${entry.time}-${index}`} className="break-words">
              {new Date(entry.time).toLocaleTimeString()} - {entry.message}
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
