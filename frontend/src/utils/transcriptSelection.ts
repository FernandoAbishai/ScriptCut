import type { Word } from '../types/project';

export type TranscriptSelectionSummary = {
  indices: number[];
  startIndex: number;
  endIndex: number;
  startTime: number;
  endTime: number;
  duration: number;
  text: string;
};

export type WordSelectionBoundary = 'start' | 'end';

export function normalizeWordSelection(indices: number[], words: Word[]) {
  if (words.length === 0 || indices.length === 0) return [];
  return [...new Set(indices)]
    .filter((index) => index >= 0 && index < words.length)
    .sort((a, b) => a - b);
}

export function summarizeWordSelection(indices: number[], words: Word[]): TranscriptSelectionSummary | null {
  const normalized = normalizeWordSelection(indices, words);
  if (normalized.length === 0) return null;
  const startIndex = normalized[0];
  const endIndex = normalized[normalized.length - 1];
  const startTime = words[startIndex].start;
  const endTime = words[endIndex].end;
  return {
    indices: normalized,
    startIndex,
    endIndex,
    startTime,
    endTime,
    duration: Math.max(0, endTime - startTime),
    text: normalized
      .map((index) => words[index]?.word || '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim(),
  };
}

export function adjustWordSelectionBoundary(
  indices: number[],
  words: Word[],
  boundary: WordSelectionBoundary,
  direction: -1 | 1,
) {
  const normalized = normalizeWordSelection(indices, words);
  if (normalized.length === 0) return normalized;

  const first = normalized[0];
  const last = normalized[normalized.length - 1];
  if (boundary === 'start') {
    if (direction < 0 && first > 0) return normalizeWordSelection([first - 1, ...normalized], words);
    if (direction > 0 && normalized.length > 1) return normalized.slice(1);
    return normalized;
  }

  if (direction > 0 && last < words.length - 1) return normalizeWordSelection([...normalized, last + 1], words);
  if (direction < 0 && normalized.length > 1) return normalized.slice(0, -1);
  return normalized;
}

export function formatSelectionDuration(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const mins = Math.floor(safeSeconds / 60);
  const secs = Math.floor(safeSeconds % 60);
  const tenths = Math.floor((safeSeconds % 1) * 10);
  return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}.${tenths}` : `${secs}.${tenths}s`;
}

export function moveTranscriptSelection(
  visibleIndices: number[],
  cursor: number,
  anchor: number,
  direction: -1 | 1,
  extend: boolean,
) {
  if (visibleIndices.length === 0) return null;
  const position = visibleIndices.indexOf(cursor);
  const next = position === -1
    ? 0
    : Math.max(0, Math.min(visibleIndices.length - 1, position + direction));
  const anchorPosition = extend ? visibleIndices.indexOf(anchor) : -1;
  const fixed = anchorPosition === -1 ? next : anchorPosition;
  return {
    cursor: visibleIndices[next],
    anchor: visibleIndices[fixed],
    indices: visibleIndices.slice(Math.min(fixed, next), Math.max(fixed, next) + 1),
  };
}
