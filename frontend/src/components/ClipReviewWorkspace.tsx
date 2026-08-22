import { Check, Play, RotateCcw, SkipForward } from 'lucide-react';
import type { ClipSuggestion, Word } from '../types/project';
import { getClipTranscript } from '../utils/clipDrafts';
import { getClipReviewKey } from '../utils/clipWorkspace';

export interface ClipReviewWorkspaceProps {
  pendingItems: ClipSuggestion[];
  skippedItems: ClipSuggestion[];
  approvedClipCount: number;
  activePreviewKey?: string | null;
  words: Word[];
  onPreview: (clip: ClipSuggestion) => void;
  onApprove: (clip: ClipSuggestion) => void;
  onSkip: (clip: ClipSuggestion) => void;
  onRestore: (clip: ClipSuggestion) => void;
  onPrepareApproved: () => void;
  onFindMore: () => void;
}

export default function ClipReviewWorkspace({
  pendingItems,
  skippedItems,
  approvedClipCount,
  activePreviewKey,
  words,
  onPreview,
  onApprove,
  onSkip,
  onRestore,
  onPrepareApproved,
  onFindMore,
}: ClipReviewWorkspaceProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-medium text-editor-text">Review {pendingItems.length}</h3>
          <p className="mt-1 text-[11px] leading-snug text-editor-text-muted">
            Preview each moment, approve the ones worth preparing, or skip it for later.
          </p>
        </div>
        {skippedItems.length > 0 && (
          <span className="shrink-0 rounded bg-editor-border px-2 py-1 text-[10px] text-editor-text-muted">
            Skipped {skippedItems.length}
          </span>
        )}
      </div>

      {pendingItems.map((clip) => (
        <ClipSuggestionReviewCard
          key={getClipReviewKey(clip)}
          clip={clip}
          transcript={getClipTranscript(words, clip)}
          isActive={activePreviewKey === getClipReviewKey(clip)}
          onPreview={() => onPreview(clip)}
          onApprove={() => onApprove(clip)}
          onSkip={() => onSkip(clip)}
        />
      ))}

      {pendingItems.length === 0 && (
        <div className="space-y-2 rounded bg-editor-surface px-3 py-3 text-xs text-editor-text-muted">
          <p>{approvedClipCount > 0 ? 'All moments are reviewed.' : 'All found moments were skipped.'}</p>
          {approvedClipCount > 0 ? (
            <button
              onClick={onPrepareApproved}
              className="rounded bg-editor-success/20 px-2 py-1.5 text-editor-success hover:bg-editor-success/30"
            >
              Prepare approved clips
            </button>
          ) : (
            <button
              onClick={onFindMore}
              className="rounded bg-editor-accent/20 px-2 py-1.5 text-editor-accent hover:bg-editor-accent/30"
            >
              Find more moments
            </button>
          )}
        </div>
      )}

      {skippedItems.length > 0 && (
        <div className="space-y-2 rounded border border-editor-border bg-editor-surface px-3 py-3">
          <div className="text-xs font-medium text-editor-text">Skipped ({skippedItems.length})</div>
          <div className="space-y-1.5">
            {skippedItems.map((clip) => (
              <div key={getClipReviewKey(clip)} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="min-w-0 truncate text-editor-text-muted" title={clip.title}>
                  {clip.title}
                </span>
                <button
                  onClick={() => onRestore(clip)}
                  className="flex shrink-0 items-center gap-1 rounded bg-editor-border px-2 py-1 text-editor-text-muted hover:bg-editor-bg hover:text-editor-text"
                >
                  <RotateCcw className="h-3 w-3" /> Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ClipSuggestionReviewCard({
  clip,
  transcript,
  isActive,
  onPreview,
  onApprove,
  onSkip,
}: {
  clip: ClipSuggestion;
  transcript: string;
  isActive: boolean;
  onPreview: () => void;
  onApprove: () => void;
  onSkip: () => void;
}) {
  const duration = typeof clip.duration === 'number' && Number.isFinite(clip.duration)
    ? clip.duration
    : clip.endTime - clip.startTime;

  return (
    <div className={`space-y-2 rounded bg-editor-surface px-3 py-3 text-xs ${isActive ? 'ring-1 ring-editor-accent/60' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-semibold text-editor-text">
            {clip.rank ? `#${clip.rank} ` : ''}{clip.title}
          </div>
          <div className="mt-1 text-[10px] text-editor-text-muted">
            {formatClipTime(clip.startTime)} - {formatClipTime(clip.endTime)} · {formatDuration(duration)}
          </div>
        </div>
        {isActive && <span className="shrink-0 text-[10px] text-editor-accent">Playing</span>}
      </div>
      <p className="text-[11px] leading-snug text-editor-text-muted">{clip.reason}</p>
      <p className="line-clamp-3 rounded bg-editor-bg px-2 py-1.5 text-[11px] leading-snug text-editor-text-muted">
        {transcript || 'No transcript text available for this moment.'}
      </p>
      <div className="grid grid-cols-3 gap-1">
        <button onClick={onPreview} className="flex items-center justify-center gap-1 rounded bg-editor-accent/20 px-2 py-1.5 text-[11px] text-editor-accent hover:bg-editor-accent/30">
          <Play className="h-3 w-3" /> {isActive ? 'Playing' : 'Preview'}
        </button>
        <button onClick={onApprove} className="flex items-center justify-center gap-1 rounded bg-editor-success/20 px-2 py-1.5 text-[11px] text-editor-success hover:bg-editor-success/30">
          <Check className="h-3 w-3" /> Approve
        </button>
        <button onClick={onSkip} className="flex items-center justify-center gap-1 rounded bg-editor-border px-2 py-1.5 text-[11px] text-editor-text-muted hover:bg-editor-bg">
          <SkipForward className="h-3 w-3" /> Skip
        </button>
      </div>
    </div>
  );
}

function formatDuration(seconds: number) {
  return Number.isFinite(seconds) && seconds > 0 ? `${Math.round(seconds)}s` : 'Duration unavailable';
}

function formatClipTime(seconds: number) {
  if (!Number.isFinite(seconds)) return '--:--';
  const totalSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, '0')}`;
}
