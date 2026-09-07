import { Film, Loader2, Users } from 'lucide-react';

type ClipFindStageProps = {
  isProcessing: boolean;
  hasWords: boolean;
  processingMessage: string;
  speakerTurnCount: number;
  onFindWithAI: () => void;
  onDraftSpeakerTurns: () => void;
};

export default function ClipFindStage({
  isProcessing,
  hasWords,
  processingMessage,
  speakerTurnCount,
  onFindWithAI,
  onDraftSpeakerTurns,
}: ClipFindStageProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-medium text-editor-text">Choose moments</h3>
      <div className="rounded border border-editor-accent/30 bg-editor-accent/5 px-3 py-3 text-xs leading-5 text-editor-text-muted">
        <div className="font-medium text-editor-text">Start from the transcript — no AI required</div>
        <p className="mt-1">
          Select the words you want, preview the selection, then choose <span className="font-medium text-editor-text">Draft clip</span>.
        </p>
      </div>

      <div className="space-y-2 border-t border-editor-border pt-3">
        <div>
          <div className="text-[11px] font-medium text-editor-text">Optional AI discovery</div>
          <p className="mt-1 text-[11px] leading-4 text-editor-text-muted">
            Ask AI to suggest candidate moments for you to review. Nothing is approved or exported automatically.
          </p>
        </div>
        <button
          onClick={onFindWithAI}
          disabled={isProcessing || !hasWords}
          className="w-full flex items-center justify-center gap-2 rounded-lg border border-editor-border bg-editor-surface px-4 py-2 text-xs font-medium text-editor-text-muted transition-colors hover:border-editor-accent/50 hover:text-editor-text disabled:opacity-50"
        >
          {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />}
          {isProcessing ? processingMessage : 'Find moments with AI'}
        </button>
      </div>

      {speakerTurnCount > 0 && (
        <button
          onClick={onDraftSpeakerTurns}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-editor-border text-editor-text-muted hover:bg-editor-surface rounded-lg text-xs font-medium transition-colors"
        >
          <Users className="w-3.5 h-3.5" />
          Draft {speakerTurnCount} Speaker Turns
        </button>
      )}
    </div>
  );
}
