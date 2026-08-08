export type TranscriptionEngine = 'auto' | 'whisperx' | 'whisper' | 'parakeet';

export type TranscriptionEngineStatus = {
  default_engine?: TranscriptionEngine | null;
  default_model?: string;
  engines?: Record<string, {
    available: boolean;
    default_model?: string;
    label?: string;
    first_class?: boolean;
    languages?: number;
    install_hint?: string;
  }>;
};

export const AUTOMATIC_TRANSCRIPTION_MODEL = 'base';

export const TRANSCRIPTION_MODELS: Record<TranscriptionEngine, Array<{ value: string; label: string }>> = {
  auto: [
    { value: 'base', label: 'base (~140 MB)' },
    { value: 'small', label: 'small (~460 MB)' },
    { value: 'medium', label: 'medium (~1.5 GB)' },
  ],
  whisperx: [
    { value: 'tiny', label: 'tiny (~75 MB)' },
    { value: 'base', label: 'base (~140 MB)' },
    { value: 'small', label: 'small (~460 MB)' },
    { value: 'medium', label: 'medium (~1.5 GB)' },
    { value: 'large', label: 'large (~2.9 GB)' },
  ],
  whisper: [
    { value: 'tiny', label: 'tiny (~75 MB)' },
    { value: 'base', label: 'base (~140 MB)' },
    { value: 'small', label: 'small (~460 MB)' },
    { value: 'medium', label: 'medium (~1.5 GB)' },
    { value: 'large', label: 'large (~2.9 GB)' },
  ],
  parakeet: [
    { value: 'nvidia/parakeet-tdt-0.6b-v3', label: 'Parakeet TDT v3 multilingual' },
  ],
};

export function getDefaultModelForEngine(engine: TranscriptionEngine): string {
  return engine === 'auto' ? AUTOMATIC_TRANSCRIPTION_MODEL : TRANSCRIPTION_MODELS[engine][0].value;
}

export function getEngineLabel(engine: TranscriptionEngine): string {
  return {
    auto: 'Automatic',
    parakeet: 'Parakeet TDT v3 multilingual',
    whisperx: 'WhisperX aligned',
    whisper: 'Whisper fallback',
  }[engine];
}

export function getEngineDescription(engine: TranscriptionEngine): string {
  return {
    auto: 'ScriptCut chooses the best available local engine.',
    parakeet: 'Multilingual local transcription when installed.',
    whisperx: 'Aligned timestamps with a Whisper-family model.',
    whisper: 'Broad compatibility with a simple local fallback.',
  }[engine];
}

export function isEngineAvailable(
  engine: TranscriptionEngine,
  status: TranscriptionEngineStatus | null,
): boolean | null {
  if (engine === 'auto' || !status?.engines || !(engine in status.engines)) return engine === 'auto' ? true : null;
  return status.engines[engine].available;
}
