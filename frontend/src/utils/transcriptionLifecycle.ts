export interface TranscriptionRunContext<Intent = string | null> {
  epoch: number;
  mediaPath: string;
  intent: Intent;
}

export function createTranscriptionRunContext<Intent>(
  epoch: number,
  mediaPath: string,
  intent: Intent,
): TranscriptionRunContext<Intent> {
  return { epoch, mediaPath, intent };
}

export function isCurrentTranscriptionRun<Intent>(
  context: TranscriptionRunContext<Intent>,
  currentEpoch: number,
  currentMediaPath: string | null,
): boolean {
  return context.epoch === currentEpoch && context.mediaPath === currentMediaPath;
}
