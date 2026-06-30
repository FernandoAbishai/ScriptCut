import type { DeletedRange, EditOperation } from '../types/project';

export type SeekDirection = 'forward' | 'backward';

export function getPlayableSeekTime(
  time: number,
  deletedRanges: Array<Pick<DeletedRange, 'start' | 'end'>>,
  previewCuts: boolean,
  direction: SeekDirection,
) {
  if (!previewCuts) return time;

  const range = [...deletedRanges]
    .sort((a, b) => a.start - b.start)
    .find((deletedRange) => time >= deletedRange.start && time < deletedRange.end);

  if (!range) return time;
  return direction === 'backward' ? range.start : range.end;
}

export type PreviewAudioLayer = 'normal' | 'mute' | 'room-tone';

export function getPreviewAudioLayer(
  time: number,
  editOperations: Array<Pick<EditOperation, 'kind' | 'start' | 'end'>>,
  previewCuts: boolean,
): PreviewAudioLayer {
  if (!previewCuts) return 'normal';

  const active = editOperations.find(
    (operation) =>
      (operation.kind === 'mute' || operation.kind === 'room-tone') &&
      time >= operation.start &&
      time < operation.end,
  );

  if (!active) return 'normal';
  return active.kind === 'room-tone' ? 'room-tone' : 'mute';
}
