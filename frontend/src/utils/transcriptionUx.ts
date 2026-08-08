export type TranscriptionFailureKind = 'canceled' | 'engine-unavailable' | 'no-engine' | 'backend' | 'unknown';

export type TranscriptionFailureCopy = {
  title: string;
  summary: string;
};

export function classifyTranscriptionFailure(rawMessage: string): TranscriptionFailureKind {
  const message = rawMessage.toLowerCase();

  if (message.includes('cancel')) return 'canceled';
  if (
    message.includes('no transcription backend') ||
    message.includes('no transcription engine') ||
    message.includes('no requested transcription backend') ||
    message.includes('no supported transcription engine')
  ) {
    return 'no-engine';
  }
  if (
    (message.includes('parakeet') || message.includes('whisperx') || message.includes('whisper')) &&
    (message.includes('not installed') || message.includes('not available') || message.includes('unavailable'))
  ) {
    return 'engine-unavailable';
  }
  if (message.includes('backend') || message.includes('transcription start failed') || message.includes('could not read transcription job')) {
    return 'backend';
  }
  return 'unknown';
}

export function getTranscriptionFailureCopy(kind: TranscriptionFailureKind): TranscriptionFailureCopy {
  switch (kind) {
    case 'canceled':
      return {
        title: 'Transcription canceled',
        summary: 'No changes were made to your media.',
      };
    case 'engine-unavailable':
      return {
        title: "That transcription method isn't available on this setup.",
        summary: 'Use Automatic or choose another available method.',
      };
    case 'no-engine':
      return {
        title: 'Transcription needs setup before ScriptCut can continue.',
        summary: 'Set up a local transcription method, then try again.',
      };
    case 'backend':
    case 'unknown':
      return {
        title: "Transcription couldn't finish",
        summary: "ScriptCut wasn't able to create the transcript.",
      };
  }
}
