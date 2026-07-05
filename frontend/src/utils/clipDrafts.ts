import type { ClipDraft, ClipSuggestion, Word } from '../types/project';

export type ClipDraftExportValidation = {
  ready: boolean;
  reasons: string[];
};

export function findWordIndexAtOrAfter(words: Word[], time: number) {
  if (words.length === 0) return -1;
  const target = Math.max(0, time);
  for (let index = 0; index < words.length; index++) {
    if (words[index].end >= target) return index;
  }
  return words.length - 1;
}

export function findWordIndexAtOrBefore(words: Word[], time: number) {
  if (words.length === 0) return -1;
  const target = Math.max(0, time);
  for (let index = words.length - 1; index >= 0; index--) {
    if (words[index].start <= target) return index;
  }
  return 0;
}

export function getWordIndicesForClip(words: Word[], clip: Pick<ClipSuggestion, 'startWordIndex' | 'endWordIndex'>) {
  if (words.length === 0) return [];
  const start = Math.max(0, Math.min(words.length - 1, Math.floor(clip.startWordIndex)));
  const end = Math.max(start, Math.min(words.length - 1, Math.floor(clip.endWordIndex)));
  return Array.from({ length: end - start + 1 }, (_, offset) => start + offset);
}

export function getClipTranscript(words: Word[], clip: Pick<ClipSuggestion, 'startWordIndex' | 'endWordIndex'>) {
  return getWordIndicesForClip(words, clip)
    .map((index) => words[index]?.word || '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeClipDraftRange(
  draft: ClipDraft,
  patch: Partial<ClipDraft>,
  words: Word[],
): Partial<ClipDraft> {
  if (words.length === 0) return patch;

  const nextStartTime = Number.isFinite(patch.startTime)
    ? Number(patch.startTime)
    : draft.startTime;
  const nextEndTime = Number.isFinite(patch.endTime)
    ? Number(patch.endTime)
    : draft.endTime;
  const startTime = Math.max(0, Math.min(nextStartTime, nextEndTime - 0.25));
  const endTime = Math.max(startTime + 0.25, nextEndTime);
  const startWordIndex = findWordIndexAtOrAfter(words, startTime);
  const endWordIndex = Math.max(startWordIndex, findWordIndexAtOrBefore(words, endTime));

  return {
    ...patch,
    startTime,
    endTime,
    startWordIndex,
    endWordIndex,
  };
}

export function validateClipDraftForExport(
  draft: ClipDraft,
  words: Word[],
  videoPath: string | null,
): ClipDraftExportValidation {
  const reasons: string[] = [];
  const duration = draft.endTime - draft.startTime;

  if (!videoPath) reasons.push('Load a video before exporting.');
  if (!draft.title.trim()) reasons.push('Add a title.');
  if (duration < 0.25) reasons.push('Set a longer clip range.');
  if (draft.startWordIndex < 0 || draft.endWordIndex < draft.startWordIndex || draft.endWordIndex >= words.length) {
    reasons.push('Trim the clip to a valid transcript range.');
  }
  if ((draft.status || 'draft') === 'suggested') reasons.push('Approve the draft before exporting.');

  return {
    ready: reasons.length === 0,
    reasons,
  };
}
