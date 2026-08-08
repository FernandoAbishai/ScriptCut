import type { EditorTaskPresentation } from '../utils/editorTask';

type EditorTaskHeaderProps = {
  presentation: EditorTaskPresentation;
};

export default function EditorTaskHeader({ presentation }: EditorTaskHeaderProps) {
  return (
    <section
      id="editor-task-context"
      role="status"
      aria-live="polite"
      className="shrink-0 border-b border-editor-border bg-editor-bg px-4 py-2"
    >
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-editor-accent">
          {presentation.workflowLabel}
        </span>
        <span className="text-sm font-semibold text-editor-text">{presentation.title}</span>
        <p className="min-w-[12rem] flex-1 text-xs leading-4 text-editor-text-muted">
          {presentation.description}
        </p>
        <span className="shrink-0 rounded bg-editor-surface px-2 py-0.5 text-[10px] text-editor-text-muted">
          {presentation.status}
        </span>
      </div>
    </section>
  );
}
