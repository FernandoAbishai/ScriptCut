import type { ReactNode } from 'react';

export type CreatorNoticeTone = 'error' | 'warning' | 'info' | 'success';

export type CreatorNoticeData = {
  tone: CreatorNoticeTone;
  title: string;
  message?: string;
  technicalDetails?: string;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
  onDismiss?: () => void;
};

export default function CreatorNotice({
  notice,
  className = '',
  children,
}: {
  notice: CreatorNoticeData;
  className?: string;
  children?: ReactNode;
}) {
  const serious = notice.tone === 'error';
  const color = serious
    ? 'border-editor-danger/30 bg-editor-danger/10 text-editor-danger'
    : notice.tone === 'warning'
      ? 'border-editor-warning/30 bg-editor-warning/10 text-editor-warning'
      : notice.tone === 'success'
        ? 'border-editor-success/30 bg-editor-success/10 text-editor-success'
        : 'border-editor-border bg-editor-surface text-editor-text';

  return (
    <div
      className={`rounded border px-3 py-2 text-xs ${color} ${className}`}
      role={serious ? 'alert' : 'status'}
      aria-live={serious ? 'assertive' : 'polite'}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium">{notice.title}</div>
          {notice.message && <div className="mt-1 leading-5 text-editor-text-muted">{notice.message}</div>}
          {children}
          {notice.technicalDetails && (
            <details className="mt-2 text-[10px] text-editor-text-muted">
              <summary className="cursor-pointer">Technical details</summary>
              <div className="mt-1 break-words">{notice.technicalDetails}</div>
            </details>
          )}
          {notice.actionLabel && notice.onAction && (
            <button
              type="button"
              onClick={() => void notice.onAction?.()}
              className="mt-2 rounded bg-editor-border px-2 py-1 text-[11px] font-medium text-editor-text hover:bg-editor-bg"
            >
              {notice.actionLabel}
            </button>
          )}
        </div>
        {notice.onDismiss && (
          <button
            type="button"
            onClick={notice.onDismiss}
            aria-label={`Dismiss ${notice.title}`}
            className="shrink-0 rounded px-1 text-base leading-none text-editor-text-muted hover:bg-editor-bg hover:text-editor-text"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
