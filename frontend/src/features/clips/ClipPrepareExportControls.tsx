import { Download, Loader2, X } from 'lucide-react';
import type { ClipBatchProgressInput } from '../../utils/clipBatchExport';
import type { ClipWorkspaceStage } from '../../utils/clipWorkspace';

type ClipPrepareExportControlsProps = {
  stage: ClipWorkspaceStage;
  preparableDraftCount: number;
  exportableDraftCount: number;
  isBatchExporting: boolean;
  batchExportProgress: ClipBatchProgressInput;
  exportBusy: boolean;
  hasCompletedExports: boolean;
  exportDirectory: string;
  defaultExportDirectory: string;
  canChooseDirectory: boolean;
  onStopBatchExport: () => void;
  onExportAll: () => void;
  onPrepareReady: () => void;
  onChooseExportDirectory: () => void;
  onExportDirectoryChange: (directory: string) => void;
};

export default function ClipPrepareExportControls({
  stage,
  preparableDraftCount,
  exportableDraftCount,
  isBatchExporting,
  batchExportProgress,
  exportBusy,
  hasCompletedExports,
  exportDirectory,
  defaultExportDirectory,
  canChooseDirectory,
  onStopBatchExport,
  onExportAll,
  onPrepareReady,
  onChooseExportDirectory,
  onExportDirectoryChange,
}: ClipPrepareExportControlsProps) {
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-medium">Your clips</h3>
          <p className="mt-1 text-[10px] text-editor-text-muted">
            {stage === 'prepare'
              ? 'Review the clip, adjust its settings, and optionally generate publishing copy.'
              : 'Export only clips that pass the existing readiness checks.'}
          </p>
        </div>
        {stage === 'export' && (
          <div className="flex items-center gap-1">
            {isBatchExporting && (
              <button onClick={onStopBatchExport} className="flex items-center gap-1 rounded bg-editor-border px-2 py-1 text-[10px] text-editor-text-muted hover:bg-editor-surface">
                <X className="w-3 h-3" /> {batchExportProgress.stopping ? 'Stopping' : 'Stop'}
              </button>
            )}
            <button
              onClick={onExportAll}
              disabled={exportBusy || exportableDraftCount === 0}
              className="flex items-center gap-1 rounded bg-editor-success/20 px-2 py-1 text-[10px] text-editor-success hover:bg-editor-success/30 disabled:opacity-50"
            >
              {isBatchExporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
              {hasCompletedExports ? 'Export remaining' : 'Export all ready clips'}
            </button>
          </div>
        )}
      </div>

      {stage === 'prepare' && preparableDraftCount > 0 && (
        <button
          onClick={onPrepareReady}
          className="w-full rounded bg-editor-success/20 px-3 py-2 text-xs text-editor-success hover:bg-editor-success/30"
        >
          Prepare {preparableDraftCount} ready {preparableDraftCount === 1 ? 'clip' : 'clips'} for export
        </button>
      )}

      {stage === 'export' && (
        <>
          <div className="rounded bg-editor-surface px-2 py-1.5 text-[10px] leading-4 text-editor-text-muted">
            Ready clips are exported in order. Failed clips remain available for retry.
          </div>
          <div className="space-y-1 rounded bg-editor-surface p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-medium uppercase tracking-wide text-editor-text-muted">Export folder</span>
              {canChooseDirectory && (
                <button disabled={exportBusy} onClick={onChooseExportDirectory} className="rounded bg-editor-border px-2 py-1 text-[10px] text-editor-text-muted hover:bg-editor-bg disabled:opacity-50">Choose</button>
              )}
            </div>
            <input
              value={exportDirectory}
              onChange={(event) => onExportDirectoryChange(event.target.value)}
              disabled={exportBusy}
              placeholder={defaultExportDirectory || 'Default export folder'}
              className="w-full rounded border border-editor-border bg-editor-bg px-2 py-1.5 text-[11px] text-editor-text focus:border-editor-accent focus:outline-none"
            />
          </div>
          {isBatchExporting && (
            <div className="space-y-1 rounded bg-editor-surface px-2.5 py-2 text-[11px] text-editor-text-muted">
              <div className="flex justify-between gap-2">
                <span>Exporting {Math.min(batchExportProgress.processed + 1, batchExportProgress.total)} of {batchExportProgress.total}</span>
                <span>{batchExportProgress.stopping ? 'Stopping after current clip' : `${batchExportProgress.exported} exported · ${batchExportProgress.failed} failed · ${batchExportProgress.total - batchExportProgress.processed} remaining`}</span>
              </div>
              <div className="flex justify-between gap-2 text-[10px]">
                <span>{batchExportProgress.exported} exported · {batchExportProgress.failed} failed · {batchExportProgress.total - batchExportProgress.processed} remaining</span>
                <span>{batchExportProgress.processed}/{batchExportProgress.total} processed</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded bg-editor-border">
                <div className="h-full bg-editor-success" style={{ width: `${Math.max(4, Math.min(100, batchExportProgress.total ? (batchExportProgress.processed / batchExportProgress.total) * 100 : 0))}%` }} />
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
