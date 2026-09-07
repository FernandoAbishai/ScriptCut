import type { ClipDraft, ClipDraftStatus, ClipSuggestion } from '../../types/project';
import { isSameClipRange } from '../../utils/clipWorkspace';
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
