import type { CaptionStyle } from '../../types/project';

export const CLIP_CAPTION_PRESETS: Record<NonNullable<CaptionStyle['preset']>, CaptionStyle> = {
  clean: {
    preset: 'clean',
    fontName: 'Arial',
    fontSize: 48,
    fontColor: '#ffffff',
    backgroundColor: '#000000',
    position: 'bottom',
    bold: true,
    wordsPerLine: 8,
  },
  creator: {
    preset: 'creator',
    fontName: 'Arial',
    fontSize: 58,
    fontColor: '#ffffff',
    backgroundColor: '#111827',
    position: 'bottom',
    bold: true,
    highlightColor: '#facc15',
    wordsPerLine: 5,
  },
  karaoke: {
    preset: 'karaoke',
    fontName: 'Arial',
    fontSize: 64,
    fontColor: '#facc15',
    backgroundColor: '#000000',
    position: 'center',
    bold: true,
    highlightColor: '#22c55e',
    wordsPerLine: 3,
  },
};

export function formatClipTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
