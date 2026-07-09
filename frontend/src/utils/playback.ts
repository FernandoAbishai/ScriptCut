import type { DeletedRange, EditOperation } from '../types/project';

export type SeekDirection = 'forward' | 'backward';
type TimeRange = Pick<DeletedRange, 'start' | 'end'>;

export interface PlaybackTimeState {
  sourceTime: number;
  previewTime: number;
  sourceDuration: number;
  previewDuration: number;
  progress: number;
}

export function getPlayableSeekTime(
  time: number,
  deletedRanges: TimeRange[],
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

export function getPreviewDuration(
  sourceDuration: number,
  deletedRanges: TimeRange[],
  previewCuts: boolean,
) {
  if (!previewCuts || sourceDuration <= 0) return sourceDuration;
  return getPlayableSegments(sourceDuration, deletedRanges).reduce(
    (total, segment) => total + (segment.end - segment.start),
    0,
  );
}

export function getPlaybackTimeState(
  sourceTime: number,
  sourceDuration: number,
  deletedRanges: TimeRange[],
  previewCuts: boolean,
): PlaybackTimeState {
  const resolvedSourceDuration = Math.max(0, Number.isFinite(sourceDuration) ? sourceDuration : 0);
  const resolvedPreviewDuration = getPreviewDuration(resolvedSourceDuration, deletedRanges, previewCuts);
  const resolvedSourceTime = clamp(sourceTime, 0, resolvedSourceDuration);
  const previewTime = sourceToPreviewTime(
    resolvedSourceTime,
    resolvedSourceDuration,
    deletedRanges,
    previewCuts,
  );

  return {
    sourceTime: resolvedSourceTime,
    previewTime,
    sourceDuration: resolvedSourceDuration,
    previewDuration: resolvedPreviewDuration,
    progress: resolvedPreviewDuration > 0 ? clamp(previewTime / resolvedPreviewDuration, 0, 1) : 0,
  };
}

export function sourceToPreviewTime(
  sourceTime: number,
  sourceDuration: number,
  deletedRanges: TimeRange[],
  previewCuts: boolean,
) {
  if (!previewCuts || sourceDuration <= 0) return sourceTime;

  const clampedTime = clamp(sourceTime, 0, sourceDuration);
  let elapsed = 0;
  for (const segment of getPlayableSegments(sourceDuration, deletedRanges)) {
    if (clampedTime < segment.start) return elapsed;
    if (clampedTime <= segment.end) return elapsed + (clampedTime - segment.start);
    elapsed += segment.end - segment.start;
  }
  return elapsed;
}

export function previewToSourceTime(
  previewTime: number,
  sourceDuration: number,
  deletedRanges: TimeRange[],
  previewCuts: boolean,
) {
  if (!previewCuts || sourceDuration <= 0) return clamp(previewTime, 0, sourceDuration);

  const segments = getPlayableSegments(sourceDuration, deletedRanges);
  const previewDuration = segments.reduce((total, segment) => total + (segment.end - segment.start), 0);
  const clampedTime = clamp(previewTime, 0, previewDuration);
  let elapsed = 0;

  for (const segment of segments) {
    const segmentDuration = segment.end - segment.start;
    if (clampedTime <= elapsed + segmentDuration) {
      return segment.start + (clampedTime - elapsed);
    }
    elapsed += segmentDuration;
  }

  return segments[segments.length - 1]?.end ?? sourceDuration;
}

function getPlayableSegments(sourceDuration: number, deletedRanges: TimeRange[]) {
  const merged = normalizeDeletedRanges(sourceDuration, deletedRanges);
  const segments: TimeRange[] = [];
  let cursor = 0;

  for (const range of merged) {
    if (range.start > cursor) segments.push({ start: cursor, end: range.start });
    cursor = Math.max(cursor, range.end);
  }

  if (cursor < sourceDuration) segments.push({ start: cursor, end: sourceDuration });
  return segments;
}

function normalizeDeletedRanges(sourceDuration: number, deletedRanges: TimeRange[]) {
  const sorted = deletedRanges
    .map((range) => ({
      start: clamp(range.start, 0, sourceDuration),
      end: clamp(range.end, 0, sourceDuration),
    }))
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start);

  const merged: TimeRange[] = [];
  for (const range of sorted) {
    const previous = merged[merged.length - 1];
    if (!previous || range.start > previous.end) {
      merged.push(range);
    } else {
      previous.end = Math.max(previous.end, range.end);
    }
  }
  return merged;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
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
