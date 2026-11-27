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
      className="workspace-context"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <span className="workspace-workflow-label">
          {presentation.workflowLabel}
        </span>
        {presentation.title !== presentation.workflowLabel && (
          <span className="text-sm font-semibold text-editor-text">{presentation.title}</span>
        )}
        <p className="workspace-task-description">
          {presentation.description}
        </p>
        <span className="workspace-task-status">
          {presentation.status}
        </span>
      </div>
    </section>
  );
}
