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

export function formatSelectionDuration(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const mins = Math.floor(safeSeconds / 60);
  const secs = Math.floor(safeSeconds % 60);
  const tenths = Math.floor((safeSeconds % 1) * 10);
  return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}.${tenths}` : `${secs}.${tenths}s`;
}
