import { useCallback } from 'react';
import type { ClipDraft, ClipReviewDecision, ClipSuggestion, Word } from '../../types/project';
import { getClipReviewKey, isSameClipRange, type ClipWorkspaceStage } from '../../utils/clipWorkspace';
import { createShortsClipDraft } from './clipDraftModel';

type SetClipDrafts = (
  drafts: ClipDraft[] | ((current: ClipDraft[]) => ClipDraft[]),
) => void;

type SetClipReviewDecisions = (
  decisions:
    | Record<string, ClipReviewDecision>
    | ((current: Record<string, ClipReviewDecision>) => Record<string, ClipReviewDecision>),
) => void;

type UseClipReviewActionsArgs = {
  clipDrafts: ClipDraft[];
  clipExportDirectory: string;
  speakerTurnClips: ClipSuggestion[];
  words: Word[];
  approveClipDraft: (id: string) => void;
  setClipDrafts: SetClipDrafts;
  setClipReviewDecisions: SetClipReviewDecisions;
  setClipStage: (stage: ClipWorkspaceStage) => void;
};

export function useClipReviewActions({
  clipDrafts,
  clipExportDirectory,
  speakerTurnClips,
  words,
  approveClipDraft,
  setClipDrafts,
  setClipReviewDecisions,
  setClipStage,
}: UseClipReviewActionsArgs) {
  const createClipDraft = useCallback(
    (clip: ClipSuggestion, source: ClipDraft['source'] = 'ai', speaker?: string, navigateToPrepare = true) => {
      setClipDrafts((current) => [
        ...current,
        {
          ...createShortsClipDraft(clip, `clip_${Date.now()}_${current.length}`, 'draft', source, speaker),
          exportDirectory: clipExportDirectory || undefined,
        },
      ]);
      if (navigateToPrepare) setClipStage('prepare');
    },
    [clipExportDirectory, setClipDrafts, setClipStage],
  );

  const approveLegacySuggestion = useCallback(
    (clip: ClipSuggestion) => createClipDraft(clip, 'ai', undefined, false),
    [createClipDraft],
  );

  const approveReviewItem = useCallback(
    (clip: ClipSuggestion) => {
      const matchingDraft = clipDrafts.find(
        (draft) => (draft.status || 'draft') === 'suggested' && isSameClipRange(draft, clip),
      );
      if (matchingDraft) approveClipDraft(matchingDraft.id);
      else approveLegacySuggestion(clip);
      setClipReviewDecisions((current) => ({
        ...current,
        [getClipReviewKey(clip)]: 'approved',
      }));
    },
    [approveClipDraft, approveLegacySuggestion, clipDrafts, setClipReviewDecisions],
  );

  const skipReviewItem = useCallback(
    (clip: ClipSuggestion) => {
      setClipReviewDecisions((current) => ({
        ...current,
        [getClipReviewKey(clip)]: 'skipped',
      }));
    },
    [setClipReviewDecisions],
  );

  const restoreSkippedReviewItem = useCallback(
    (clip: ClipSuggestion) => {
      setClipReviewDecisions((current) => {
        const next = { ...current };
        delete next[getClipReviewKey(clip)];
        return next;
      });
    },
    [setClipReviewDecisions],
  );

  const createSpeakerTurnDrafts = useCallback(() => {
    if (speakerTurnClips.length === 0) return;
    setClipDrafts((current) => [
      ...current,
      ...speakerTurnClips.map((clip, index) => {
        const speaker = words[clip.startWordIndex]?.speaker || 'Unknown speaker';
        return {
          ...createShortsClipDraft(clip, `speaker_clip_${Date.now()}_${current.length}_${index}`, 'draft', 'speaker-turn', speaker),
          exportDirectory: clipExportDirectory || undefined,
        };
      }),
    ]);
    setClipStage('prepare');
  }, [clipExportDirectory, setClipDrafts, setClipStage, speakerTurnClips, words]);

  return {
    approveReviewItem,
    skipReviewItem,
    restoreSkippedReviewItem,
    createSpeakerTurnDrafts,
  };
}
