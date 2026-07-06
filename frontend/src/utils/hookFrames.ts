import type { ClipDraft } from '../types/project';

export type HookFrameCandidate = {
  id: string;
  label: string;
  time: number;
  offset: number;
  overlayText: string;
  filename: string;
  warnings: string[];
};

const FRAME_OFFSETS = [
  { id: 'opening', label: 'Opening', ratio: 0.06 },
  { id: 'hook', label: 'Hook Beat', ratio: 0.22 },
  { id: 'midpoint', label: 'Midpoint', ratio: 0.5 },
  { id: 'payoff', label: 'Payoff', ratio: 0.82 },
];

export function getHookFrameText(draft: Pick<ClipDraft, 'thumbnailText' | 'hook' | 'title'>) {
  return (draft.thumbnailText || draft.hook || draft.title || '').trim();
}

export function safeHookFrameFilename(value: string) {
  const stem = value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return stem || 'scriptcut_hook_frame';
}

export function buildHookFrameCandidates(draft: ClipDraft): HookFrameCandidate[] {
  const duration = Math.max(0.25, draft.endTime - draft.startTime);
  const overlayText = getHookFrameText(draft);

  return FRAME_OFFSETS.map((frame) => {
    const offset = Math.min(duration - 0.1, Math.max(0, duration * frame.ratio));
    const time = Number((draft.startTime + offset).toFixed(2));
    const warnings: string[] = [];

    if (!overlayText) warnings.push('Add a hook or thumbnail text.');
    if (overlayText.length > 64) warnings.push('Keep thumbnail text under 64 characters.');
    if (draft.aspectRatio !== 'vertical') warnings.push('9:16 framing is recommended for shorts thumbnails.');

    return {
      id: frame.id,
      label: frame.label,
      time,
      offset: Number(offset.toFixed(2)),
      overlayText,
      filename: `${safeHookFrameFilename(draft.title)}_${frame.id}_${Math.round(time * 1000)}.png`,
      warnings,
    };
  });
}

export function getSelectedHookFrame(draft: ClipDraft) {
  const candidates = buildHookFrameCandidates(draft);
  if (Number.isFinite(draft.hookFrameTime)) {
    return candidates.reduce((closest, candidate) => (
      Math.abs(candidate.time - Number(draft.hookFrameTime)) < Math.abs(closest.time - Number(draft.hookFrameTime))
        ? candidate
        : closest
    ), candidates[0]);
  }
  return candidates[1] || candidates[0];
}

export function formatHookFrameBrief(draft: ClipDraft, frame = getSelectedHookFrame(draft)) {
  return [
    `Thumbnail Frame: ${frame.label}`,
    `Timestamp: ${frame.time.toFixed(2)}s`,
    `Overlay: ${frame.overlayText || getHookFrameText(draft)}`,
    `Filename: ${frame.filename}`,
    `Frame: ${draft.aspectRatio === 'vertical' ? '9:16' : draft.aspectRatio === 'square' ? '1:1' : 'source'}`,
    draft.reframe && draft.aspectRatio !== 'source'
      ? `Safe frame center: ${Math.round(draft.reframe.x)}% / ${Math.round(draft.reframe.y)}%`
      : '',
    draft.caption ? `Supporting caption: ${draft.caption}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
