import type { ClipDraft, ClipDraftStatus, Word } from '../types/project';
import { validateClipDraftForExport } from './clipDrafts';

export const INTERRUPTED_CLIP_EXPORT_ERROR =
  'Export was interrupted before ScriptCut could confirm completion. Retry this clip.';

const BATCH_EXPORT_STATUSES = new Set<ClipDraftStatus>(['draft', 'packaged', 'failed']);

export function getClipBatchExportCandidates(
  drafts: ClipDraft[],
  words: Word[],
  videoPath: string | null,
) {
  return drafts.filter(
    (draft) =>
      BATCH_EXPORT_STATUSES.has(draft.status || 'draft') &&
      validateClipDraftForExport(draft, words, videoPath).ready,
  );
}

export function hasRecoverableClipExports(
  drafts: ClipDraft[],
  words: Word[],
  videoPath: string | null,
) {
  return getClipBatchExportCandidates(drafts, words, videoPath).length > 0;
}

export function recoverInterruptedClipDraft(draft: ClipDraft) {
  if (draft.status !== 'exporting') return draft;

  return {
    ...draft,
    status: 'failed' as const,
    lastError: draft.lastError?.trim() || INTERRUPTED_CLIP_EXPORT_ERROR,
  };
}

export function recoverInterruptedClipDrafts(drafts: ClipDraft[]) {
  return drafts.map(recoverInterruptedClipDraft);
}

export type ClipBatchProgressInput = {
  processed: number;
  total: number;
  exported: number;
  failed: number;
  stopping: boolean;
};

export type ClipBatchProgressSummary = ClipBatchProgressInput & {
  remaining: number;
};

export function getClipBatchProgressSummary({
  processed,
  total,
  exported,
  failed,
  stopping,
}: ClipBatchProgressInput): ClipBatchProgressSummary {
  const boundedTotal = Math.max(0, Math.floor(total));
  const boundedProcessed = Math.max(0, Math.min(boundedTotal, Math.floor(processed)));
  return {
    processed: boundedProcessed,
    total: boundedTotal,
    exported: Math.max(0, Math.floor(exported)),
    failed: Math.max(0, Math.floor(failed)),
    remaining: boundedTotal - boundedProcessed,
    stopping,
  };
}
