import type { ClipQueueSummary, ClipWorkspaceStage } from '../../utils/clipWorkspace';

type ClipWorkspaceHeaderProps = {
  stage: ClipWorkspaceStage;
  pendingReviewCount: number;
  readyCount: number;
  queueSummary: ClipQueueSummary & { copyReady: number };
  hasDrafts: boolean;
  onStageChange: (stage: ClipWorkspaceStage) => void;
};

export default function ClipWorkspaceHeader({
  stage,
  pendingReviewCount,
  readyCount,
  queueSummary,
  hasDrafts,
  onStageChange,
}: ClipWorkspaceHeaderProps) {
  return (
    <>
      <div>
        <h2 className="text-sm font-semibold text-editor-text">Create Clips</h2>
        <p className="mt-1 text-xs text-editor-text-muted">
          Find moments, review suggestions, prepare approved clips, and export the ready results.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-1" aria-label="Clip workspace stages">
        {([
          { stage: 'find', label: 'Find' },
          { stage: 'review', label: `Review ${pendingReviewCount}` },
          { stage: 'prepare', label: `Prepare ${queueSummary.prepare}` },
          { stage: 'export', label: `Export ${readyCount} ready` },
        ] as Array<{ stage: ClipWorkspaceStage; label: string }>).map(({ stage: targetStage, label }) => (
          <button
            key={targetStage}
            onClick={() => onStageChange(targetStage)}
            className={`rounded px-1.5 py-1.5 text-[10px] font-medium capitalize ${
              stage === targetStage
                ? 'bg-editor-accent/20 text-editor-accent'
                : 'bg-editor-surface text-editor-text-muted hover:text-editor-text'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {hasDrafts && (
        <div className="grid grid-cols-8 gap-1 text-center text-[10px]">
          <QueueStat label="Suggested" value={queueSummary.suggested} />
          <QueueStat label="Prepare" value={queueSummary.prepare} />
          <QueueStat label="Copy ready" value={queueSummary.copyReady} />
          <QueueStat label="Ready" value={readyCount} />
          <QueueStat label="Exporting" value={queueSummary.exporting} />
          <QueueStat label="Retry" value={queueSummary.retry} warning={queueSummary.retry > 0} />
          <QueueStat label="Failed" value={queueSummary.failed} warning={queueSummary.failed > 0} />
          <QueueStat label="Exported" value={queueSummary.exported} />
        </div>
      )}
    </>
  );
}

function QueueStat({ label, value, warning = false }: { label: string; value: number; warning?: boolean }) {
  return (
    <div className={`rounded bg-editor-surface px-1.5 py-1 ${warning ? 'text-editor-warning' : 'text-editor-text-muted'}`}>
      <div className="text-xs font-semibold text-editor-text">{value}</div>
      <div>{label}</div>
    </div>
  );
}
