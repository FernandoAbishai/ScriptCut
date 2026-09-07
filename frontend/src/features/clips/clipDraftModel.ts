import type { ClipDraft, ClipDraftStatus, ClipSuggestion } from '../../types/project';
import { isSameClipRange } from '../../utils/clipWorkspace';
import type { TranscriptSelectionSummary } from '../../utils/transcriptSelection';
import { CLIP_CAPTION_PRESETS } from './presentation';

export const SHORTS_DRAFT_DEFAULTS = {
  format: 'mp4',
  resolution: '1080p',
  aspectRatio: 'vertical',
  reframe: { x: 50, y: 50 },
  enhanceAudio: false,
  captions: 'burn-in',
  captionStyle: CLIP_CAPTION_PRESETS.creator,
  backgroundRemoval: { enabled: false, replacement: 'blur', color: '#111827' },
  platform: 'shorts',
} satisfies Pick<ClipDraft, 'format' | 'resolution' | 'aspectRatio' | 'reframe' | 'enhanceAudio' | 'captions' | 'captionStyle' | 'backgroundRemoval' | 'platform'>;

export function createShortsClipDraft(
  clip: ClipSuggestion,
  id: string,
  status: ClipDraftStatus,
  source: ClipDraft['source'] = 'ai',
  speaker?: string,
): ClipDraft {
  return {
    ...clip,
    id,
    status,
    ...SHORTS_DRAFT_DEFAULTS,
    source,
    speaker,
  };
}

export function appendDiscoveredClipDrafts(
  current: ClipDraft[],
  clips: ClipSuggestion[],
  idPrefix: string,
) {
  const next = [...current];
  for (const clip of clips) {
    if (next.some((draft) => isSameClipRange(draft, clip))) continue;
    next.push(createShortsClipDraft(clip, `${idPrefix}_${Date.now()}_${next.length}`, 'suggested'));
  }
  return next;
}

export function appendTranscriptSelectionClipDraft(
  current: ClipDraft[],
  selection: TranscriptSelectionSummary,
) {
  const title = selection.text.split(/\s+/).slice(0, 8).join(' ') || 'Transcript clip';
  const clip: ClipSuggestion = {
    title,
    reason: 'Created from transcript selection',
    startWordIndex: selection.startIndex,
    endWordIndex: selection.endIndex,
    startTime: selection.startTime,
    endTime: selection.endTime,
  };
  return [
    ...current,
    {
      ...createShortsClipDraft(
        clip,
        `transcript_clip_${Date.now()}_${current.length}`,
        'draft',
        'transcript-selection',
      ),
      hook: '',
      description: '',
      caption: '',
      hashtags: [],
    },
  ];
}
