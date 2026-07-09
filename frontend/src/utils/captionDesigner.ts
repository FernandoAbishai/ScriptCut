import type { CaptionStyle } from '../types/project';

export function getCaptionPresetLabel(preset?: CaptionStyle['preset']) {
  if (preset === 'creator') return 'Creator';
  if (preset === 'karaoke') return 'Karaoke';
  return 'Clean';
}

export function getCaptionAnimationLabel(animation?: CaptionStyle['animation']) {
  if (animation === 'pop') return 'Pop in';
  if (animation === 'karaoke') return 'Word timed';
  return 'Static';
}

export function getCaptionPreviewWords(style: CaptionStyle, sample = 'This is the hook that stops the scroll') {
  const limit = Math.max(1, style.wordsPerLine ?? 5);
  return sample.split(/\s+/).slice(0, limit);
}

export function getCaptionPositionClass(position: CaptionStyle['position']) {
  if (position === 'top') return 'items-start pt-4';
  if (position === 'center') return 'items-center';
  return 'items-end pb-4';
}
