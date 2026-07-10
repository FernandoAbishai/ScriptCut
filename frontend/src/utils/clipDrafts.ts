import type { ClipDraft, ClipSuggestion, DeletedRange, Word } from '../types/project';

export type ClipDraftExportValidation = {
  ready: boolean;
  reasons: string[];
};

export type ClipDraftReadinessScore = {
  score: number;
  label: string;
  reasons: string[];
};

export type ClipExportSegment = {
  start: number;
  end: number;
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

/**
 * Returns the source segments that remain after applying transcript cuts to a
 * clip. The renderer concatenates these segments, so clips stay faithful to
 * the edited main timeline instead of exporting the untouched source range.
 */
export function getClipExportSegments(
  clip: Pick<ClipSuggestion, 'startTime' | 'endTime'>,
  deletedRanges: DeletedRange[],
): ClipExportSegment[] {
  const clipStart = Math.max(0, clip.startTime);
  const clipEnd = Math.max(clipStart, clip.endTime);
  if (clipEnd - clipStart < 0.001) return [];

  const cuts = deletedRanges
    .map((range) => ({
      start: Math.max(clipStart, range.start),
      end: Math.min(clipEnd, range.end),
    }))
    .filter((range) => range.end - range.start > 0.001)
    .sort((left, right) => left.start - right.start)
    .reduce<ClipExportSegment[]>((merged, range) => {
      const previous = merged[merged.length - 1];
      if (previous && range.start <= previous.end) {
        previous.end = Math.max(previous.end, range.end);
      } else {
        merged.push(range);
      }
      return merged;
    }, []);

  const kept: ClipExportSegment[] = [];
  let cursor = clipStart;
  for (const cut of cuts) {
    if (cut.start - cursor > 0.001) kept.push({ start: cursor, end: cut.start });
    cursor = Math.max(cursor, cut.end);
  }
  if (clipEnd - cursor > 0.001) kept.push({ start: cursor, end: clipEnd });
  return kept;
}

/**
 * Re-times transcript words to the concatenated clip timeline. Caption words
 * hidden in the editor are removed here; deleted words disappear with their
 * source segment rather than being shown at stale source timestamps.
 */
export function buildClipExportCaptionWords(
  words: Word[],
  clip: Pick<ClipSuggestion, 'startWordIndex' | 'endWordIndex'>,
  segments: ClipExportSegment[],
  hiddenIndices: Set<number> = new Set(),
): Word[] {
  const indices = getWordIndicesForClip(words, clip);
  const result: Word[] = [];
  let outputOffset = 0;

  for (const segment of segments) {
    for (const index of indices) {
      if (hiddenIndices.has(index)) continue;
      const word = words[index];
      if (!word) continue;
      const start = Math.max(word.start, segment.start);
      const end = Math.min(word.end, segment.end);
      if (end - start <= 0.001) continue;
      result.push({
        ...word,
        start: roundExportTime(outputOffset + start - segment.start),
        end: roundExportTime(outputOffset + end - segment.start),
      });
    }
    outputOffset += segment.end - segment.start;
  }
  return result;
}

function roundExportTime(value: number) {
  return Math.round(value * 1000) / 1000;
}

export function getClipDraftReadinessScore(
  draft: ClipDraft,
  words: Word[],
  videoPath: string | null,
): ClipDraftReadinessScore {
  const reasons: string[] = [];
  let score = 0;
  const duration = draft.endTime - draft.startTime;
  const validation = validateClipDraftForExport(draft, words, videoPath);

  if (validation.ready) {
    score += 30;
  } else {
    reasons.push(...validation.reasons);
  }

  if (duration >= 12 && duration <= 60) {
    score += 15;
  } else {
    reasons.push(duration < 12 ? 'Shorts usually need at least 12 seconds.' : 'Trim closer to 60 seconds for shorts.');
  }

  if (draft.aspectRatio === 'vertical' && draft.resolution === '1080p' && draft.format === 'mp4') {
    score += 15;
  } else {
    reasons.push('Use vertical 1080p MP4 for Shorts/Reels/TikTok.');
  }

  if ((draft.captions || 'none') === 'burn-in') {
    score += 10;
  } else {
    reasons.push('Enable creator captions for social viewing.');
  }

  if ((draft.hook || '').trim() && (draft.caption || '').trim() && (draft.hashtags || []).length > 0) {
    score += 20;
  } else {
    reasons.push('Package hook, caption, and hashtags before export.');
  }

  if ((draft.status || 'draft') === 'packaged' || (draft.status || 'draft') === 'exported') {
    score += 10;
  }

  const boundedScore = Math.max(0, Math.min(100, score));
  return {
    score: boundedScore,
    label: boundedScore >= 85 ? 'Ready' : boundedScore >= 65 ? 'Review' : 'Needs work',
    reasons: [...new Set(reasons)].slice(0, 4),
  };
}
