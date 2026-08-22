import type {
  ClipDraft,
  ClipDraftStatus,
  ClipReviewDecision,
  ClipSuggestion,
} from '../types/project';

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

export type ClipReviewItem = ClipSuggestion;

export function getClipReviewKey(
  clip: Pick<ClipSuggestion, 'startWordIndex' | 'endWordIndex'>,
) {
  return `clip-${clip.startWordIndex}-${clip.endWordIndex}`;
}

export function getClipPreviewRange(
  clip: Pick<ClipSuggestion, 'startTime' | 'endTime'>,
): { start: number; end: number } | null {
  if (!Number.isFinite(clip.startTime) || !Number.isFinite(clip.endTime)) return null;
  if (clip.endTime <= clip.startTime) return null;
  return { start: clip.startTime, end: clip.endTime };
}

export function normalizeClipReviewDecisions(decisions: unknown): Record<string, ClipReviewDecision> {
  if (!decisions || typeof decisions !== 'object') return {};
  return Object.fromEntries(
    Object.entries(decisions).filter(
      ([key, decision]) =>
        typeof key === 'string' && key.trim().length > 0 &&
        (decision === 'approved' || decision === 'skipped'),
    ),
  ) as Record<string, ClipReviewDecision>;
}

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

function getReviewCandidates(
  drafts: ClipDraft[],
  suggestions: ClipSuggestion[] = [],
): ClipReviewItem[] {
  const candidates: ClipReviewItem[] = [];
  const seen = new Set<string>();
  const draftKeys = new Set(drafts.map((draft) => getClipReviewKey(draft)));

  for (const draft of drafts) {
    if (!REVIEW_STATUSES.has(draft.status || 'draft')) continue;
    const key = getClipReviewKey(draft);
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(draft);
  }

  for (const suggestion of suggestions) {
    const key = getClipReviewKey(suggestion);
    if (seen.has(key) || draftKeys.has(key)) continue;
    seen.add(key);
    candidates.push(suggestion);
  }

  return candidates;
}

export function getPendingReviewItems(
  drafts: ClipDraft[],
  suggestions: ClipSuggestion[] = [],
  decisions: Record<string, ClipReviewDecision> = {},
): ClipReviewItem[] {
  return getReviewCandidates(drafts, suggestions).filter(
    (clip) => decisions[getClipReviewKey(clip)] !== 'approved' && decisions[getClipReviewKey(clip)] !== 'skipped',
  );
}

export function getSkippedReviewItems(
  drafts: ClipDraft[],
  suggestions: ClipSuggestion[] = [],
  decisions: Record<string, ClipReviewDecision> = {},
): ClipReviewItem[] {
  return getReviewCandidates(drafts, suggestions).filter(
    (clip) => decisions[getClipReviewKey(clip)] === 'skipped',
  );
}

export function getReviewCounts(
  drafts: ClipDraft[],
  suggestions: ClipSuggestion[] = [],
  decisions: Record<string, ClipReviewDecision> = {},
) {
  const candidates = getReviewCandidates(drafts, suggestions);
  return {
    pending: candidates.filter((clip) => {
      const decision = decisions[getClipReviewKey(clip)];
      return decision !== 'approved' && decision !== 'skipped';
    }).length,
    skipped: candidates.filter((clip) => decisions[getClipReviewKey(clip)] === 'skipped').length,
    approved: candidates.filter((clip) => decisions[getClipReviewKey(clip)] === 'approved').length,
  };
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
