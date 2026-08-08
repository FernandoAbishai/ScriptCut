import type { ChangeEvent } from 'react';
import {
  getDefaultModelForEngine,
  getEngineDescription,
  getEngineLabel,
  isEngineAvailable,
  TRANSCRIPTION_MODELS,
  type TranscriptionEngine,
  type TranscriptionEngineStatus,
} from '../utils/transcriptionModels';

export type { TranscriptionEngine, TranscriptionEngineStatus } from '../utils/transcriptionModels';

type TranscriptionOptionsProps = {
  transcriptionEngine: TranscriptionEngine;
  onEngineChange: (engine: TranscriptionEngine) => void;
  transcriptionModel: string;
  onModelChange: (model: string) => void;
  transcriptionEngineStatus: TranscriptionEngineStatus | null;
  onUseAutomatic?: () => void;
};

export default function TranscriptionOptions({
  transcriptionEngine,
  onEngineChange,
  transcriptionModel,
  onModelChange,
  transcriptionEngineStatus,
  onUseAutomatic,
}: TranscriptionOptionsProps) {
  const availability = isEngineAvailable(transcriptionEngine, transcriptionEngineStatus);
  const currentModels = TRANSCRIPTION_MODELS[transcriptionEngine];
  const modelIsKnown = currentModels.some((model) => model.value === transcriptionModel);

  const handleEngineChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const engine = event.target.value as TranscriptionEngine;
    onEngineChange(engine);
    onModelChange(getDefaultModelForEngine(engine));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-center gap-2">
        <div className="min-w-[12rem] flex-1">
          <label className="mb-1 block text-[11px] font-medium text-editor-text" htmlFor="transcription-engine">
            Engine
          </label>
          <select
            id="transcription-engine"
            value={transcriptionEngine}
            onChange={handleEngineChange}
            className="w-full rounded-md border border-editor-border bg-editor-bg px-3 py-1.5 text-xs text-editor-text focus:border-editor-accent focus:outline-none"
          >
            {(Object.keys(TRANSCRIPTION_MODELS) as TranscriptionEngine[]).map((engine) => {
              const engineAvailability = isEngineAvailable(engine, transcriptionEngineStatus);
              return (
                <option key={engine} value={engine} disabled={engine !== 'auto' && engineAvailability === false}>
                  {getEngineLabel(engine)}{engineAvailability === false ? ' — unavailable' : engine === 'auto' ? ' — Recommended' : ''}
                </option>
              );
            })}
          </select>
          <p className="mt-1 text-[10px] leading-4 text-editor-text-muted">{getEngineDescription(transcriptionEngine)}</p>
        </div>

        <div className="min-w-[12rem] flex-1">
          <label className="mb-1 block text-[11px] font-medium text-editor-text" htmlFor="transcription-model">
            Model
          </label>
          <select
            id="transcription-model"
            value={modelIsKnown ? transcriptionModel : currentModels[0].value}
            onChange={(event) => onModelChange(event.target.value)}
            className="w-full rounded-md border border-editor-border bg-editor-bg px-3 py-1.5 text-xs text-editor-text focus:border-editor-accent focus:outline-none"
          >
            {currentModels.map((model) => (
              <option key={model.value} value={model.value}>{model.label}</option>
            ))}
          </select>
        </div>
      </div>

      {availability === false && (
        <div className="flex flex-wrap items-center justify-center gap-2 rounded bg-editor-warning/10 px-3 py-2 text-[11px] text-editor-warning" role="status">
          <span>{getEngineLabel(transcriptionEngine)} is not available here. Automatic will choose another installed engine.</span>
          {onUseAutomatic && (
            <button
              type="button"
              onClick={onUseAutomatic}
              className="rounded border border-editor-warning/40 px-2 py-1 font-medium hover:bg-editor-warning/10"
            >
              Use Automatic
            </button>
          )}
        </div>
      )}
    </div>
  );
}
