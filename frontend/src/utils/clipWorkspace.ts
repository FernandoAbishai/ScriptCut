import type { ClipDraft, ClipDraftStatus, ClipSuggestion } from '../types/project';

export type ClipWorkspaceStage = 'find' | 'review' | 'prepare' | 'export';

export function readClipDiscoveryResult(result: unknown): {
  clips: ClipSuggestion[];
  requestedCount: number;
  returnedCount: number;
  shortfall: number;
  stage: ClipWorkspaceStage;
} {
  const candidate = result && typeof result === 'object' ? result as { clips?: unknown; requestedCount?: unknown } : {};
  const clips = Array.isArray(candidate.clips) ? candidate.clips as ClipSuggestion[] : [];
  const requestedCount = typeof candidate.requestedCount === 'number' && Number.isInteger(candidate.requestedCount) && candidate.requestedCount > 0
    ? candidate.requestedCount
    : 5;
  return {
    clips,
    requestedCount,
    returnedCount: clips.length,
    shortfall: Math.max(0, requestedCount - clips.length),
    stage: clips.length > 0 ? 'review' : 'find',
  };
}

const REVIEW_STATUSES = new Set<ClipDraftStatus>(['suggested']);
const PREPARE_STATUSES = new Set<ClipDraftStatus>(['draft', 'packaged']);
const EXPORT_STATUSES = new Set<ClipDraftStatus>(['exporting', 'exported', 'failed']);

export function getInitialClipWorkspaceStage(
  drafts: ClipDraft[],
  suggestions: ClipSuggestion[] = [],
): ClipWorkspaceStage {
  if (
    drafts.some((draft) => REVIEW_STATUSES.has(draft.status || 'draft')) ||
    getUnmatchedLegacyClipSuggestions(suggestions, drafts).length > 0
  ) {
    return 'review';
  }
  if (drafts.some((draft) => PREPARE_STATUSES.has(draft.status || 'draft'))) {
    return 'prepare';
  }
  if (drafts.length > 0 && drafts.every((draft) => EXPORT_STATUSES.has(draft.status || 'draft'))) {
    return 'export';
  }
  return 'find';
}

export function getUnmatchedLegacyClipSuggestions(
  suggestions: ClipSuggestion[],
  drafts: ClipDraft[],
): ClipSuggestion[] {
  return suggestions.filter(
    (suggestion) => !drafts.some((draft) => isSameClipRange(draft, suggestion)),
  );
}

export function getPendingReviewCount(
  drafts: ClipDraft[],
  suggestions: ClipSuggestion[] = [],
): number {
  return drafts.filter((draft) => REVIEW_STATUSES.has(draft.status || 'draft')).length
    + getUnmatchedLegacyClipSuggestions(suggestions, drafts).length;
}

export function removeMatchingClipSuggestions(
  suggestions: ClipSuggestion[],
  draft: Pick<ClipDraft, 'startWordIndex' | 'endWordIndex'>,
): ClipSuggestion[] {
  return suggestions.filter((suggestion) => !isSameClipRange(draft, suggestion));
}

export function isSameClipRange(left: Pick<ClipSuggestion, 'startWordIndex' | 'endWordIndex'>, right: Pick<ClipSuggestion, 'startWordIndex' | 'endWordIndex'>) {
  return left.startWordIndex === right.startWordIndex && left.endWordIndex === right.endWordIndex;
}

export function isClipDraftInStage(draft: ClipDraft, stage: ClipWorkspaceStage) {
  const status = draft.status || 'draft';
  if (stage === 'review') return status === 'suggested';
  if (stage === 'prepare') return !REVIEW_STATUSES.has(status) && status !== 'exported';
  if (stage === 'export') return !REVIEW_STATUSES.has(status);
  return false;
}
