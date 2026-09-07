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
      <h3 className="text-xs font-medium text-editor-text">Find moments</h3>
      <p className="text-xs leading-5 text-editor-text-muted">
        Start with AI discovery, or choose moments yourself from the transcript. AI suggestions are never approved or exported automatically.
      </p>
      <button
        onClick={onFindWithAI}
        disabled={isProcessing || !hasWords}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-editor-accent hover:bg-editor-accent-hover disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
      >
        {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />}
        {isProcessing ? processingMessage : 'Find moments with AI'}
      </button>
      <div className="rounded bg-editor-surface px-3 py-2 text-xs leading-5 text-editor-text-muted">
        <span className="font-medium text-editor-text">Choose moments yourself:</span> select transcript words, then choose <span className="text-editor-text">Draft clip</span>. Speaker turns are a secondary shortcut.
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
