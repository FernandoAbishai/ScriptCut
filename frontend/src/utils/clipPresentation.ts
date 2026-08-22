import type {
  CaptionStyle,
  ClipDraft,
  ClipSuggestion,
  DeletedRange,
  EditOperation,
  ReframeOptions,
  Word,
} from '../types/project';

export const ASS_PREVIEW_REFERENCE_HEIGHT = 1080;
export const DEFAULT_CAPTION_WORDS_PER_LINE = 8;
export const DEFAULT_REFRAME = { x: 50, y: 50 } as const;

export type ClipPresentationAspectRatio = 'source' | 'vertical' | 'square';
export type ClipPresentationCaptions = 'none' | 'burn-in' | 'sidecar';

export type ClipPresentationPreview = {
  key: string;
  draftId?: string;
  startWordIndex: number;
  endWordIndex: number;
  aspectRatio: ClipPresentationAspectRatio;
  reframe: ReframeOptions;
  captions: ClipPresentationCaptions;
  captionStyle?: CaptionStyle;
};

export type ClipPresentationSource = Pick<
  ClipSuggestion,
  'startWordIndex' | 'endWordIndex'
> & Partial<Pick<ClipDraft, 'id' | 'aspectRatio' | 'reframe' | 'captions' | 'captionStyle'>>;

export type ClipPresentationDefaults = Pick<
  ClipPresentationPreview,
  'aspectRatio' | 'reframe' | 'captions' | 'captionStyle'
>;

export type ClipCaptionWord = Word & { sourceIndex: number };

export type ClipCaptionChunk = {
  words: ClipCaptionWord[];
  start: number;
  end: number;
};

export function clampReframe(reframe?: Partial<ReframeOptions> | null): ReframeOptions {
  return {
    x: clampPercent(reframe?.x, DEFAULT_REFRAME.x),
    y: clampPercent(reframe?.y, DEFAULT_REFRAME.y),
  };
}

export function getClipFramePreviewStyle(
  aspectRatio: ClipPresentationAspectRatio,
  reframe?: Partial<ReframeOptions> | null,
) {
  const position = clampReframe(reframe);
  return {
    objectFit: aspectRatio === 'source' ? 'contain' as const : 'cover' as const,
    objectPosition: aspectRatio === 'source' ? '50% 50%' : `${position.x}% ${position.y}%`,
  };
}

export function buildClipPresentationPreview(
  key: string,
  clip: ClipPresentationSource,
  defaults: ClipPresentationDefaults,
): ClipPresentationPreview {
  const aspectRatio = isAspectRatio(clip.aspectRatio) ? clip.aspectRatio : defaults.aspectRatio;
  const captions = isCaptionMode(clip.captions) ? clip.captions : defaults.captions;

  return {
    key,
    draftId: clip.id,
    startWordIndex: clip.startWordIndex,
    endWordIndex: clip.endWordIndex,
    aspectRatio,
    reframe: clampReframe(clip.reframe || defaults.reframe),
    captions,
    captionStyle: clip.captionStyle || defaults.captionStyle,
  };
}

export function updateClipPresentationPreviewForDraft(
  preview: ClipPresentationPreview | null,
  draft: ClipDraft,
) {
  if (!preview || preview.draftId !== draft.id) return preview;
  return buildClipPresentationPreview(preview.key, draft, {
    aspectRatio: preview.aspectRatio,
    reframe: preview.reframe,
    captions: preview.captions,
    captionStyle: preview.captionStyle,
  });
}

export function getVisibleClipCaptionWords(
  words: Word[],
  preview: Pick<ClipPresentationPreview, 'startWordIndex' | 'endWordIndex'>,
  deletedRanges: DeletedRange[] = [],
  editOperations: EditOperation[] = [],
): ClipCaptionWord[] {
  if (words.length === 0) return [];

  const start = Math.max(0, Math.floor(preview.startWordIndex));
  const end = Math.min(words.length - 1, Math.floor(preview.endWordIndex));
  if (end < start) return [];

  const deleted = new Set<number>();
  for (const range of deletedRanges) {
    for (const index of range.wordIndices || []) deleted.add(index);
  }
  const hidden = new Set<number>();
  for (const operation of editOperations) {
    if (operation.kind === 'delete') {
      for (const index of operation.wordIndices || []) deleted.add(index);
    }
    if (operation.kind === 'caption-only') {
      for (const index of operation.wordIndices || []) hidden.add(index);
    }
  }

  const visible: ClipCaptionWord[] = [];
  for (let sourceIndex = start; sourceIndex <= end; sourceIndex++) {
    if (deleted.has(sourceIndex) || hidden.has(sourceIndex)) continue;
    const word = words[sourceIndex];
    if (!word || !Number.isFinite(word.start) || !Number.isFinite(word.end) || word.end <= word.start) continue;
    visible.push({ ...word, sourceIndex });
  }
  return visible;
}

export function chunkClipCaptionWords(
  words: ClipCaptionWord[],
  style?: CaptionStyle | null,
): ClipCaptionChunk[] {
  const wordsPerLine = getCaptionWordsPerLine(style);
  const chunks: ClipCaptionChunk[] = [];
  for (let index = 0; index < words.length; index += wordsPerLine) {
    const chunkWords = words.slice(index, index + wordsPerLine);
    if (chunkWords.length === 0) continue;
    chunks.push({
      words: chunkWords,
      start: chunkWords[0].start,
      end: chunkWords[chunkWords.length - 1].end,
    });
  }
  return chunks;
}

export function getActiveCaptionChunk(chunks: ClipCaptionChunk[], time: number) {
  if (!Number.isFinite(time)) return null;
  return chunks.find((chunk) => time >= chunk.start && time <= chunk.end) || null;
}

export function getActiveKaraokeWord(chunk: ClipCaptionChunk | null, time: number) {
  if (!chunk || !Number.isFinite(time)) return null;
  return chunk.words.find((word) => time >= word.start && time < word.end)
    || (time === chunk.end ? chunk.words[chunk.words.length - 1] : null);
}

export function getCaptionPreviewGeometry(style: CaptionStyle, frameHeight: number) {
  const height = Number.isFinite(frameHeight) && frameHeight > 0
    ? frameHeight
    : ASS_PREVIEW_REFERENCE_HEIGHT;
  const scale = height / ASS_PREVIEW_REFERENCE_HEIGHT;
  const fontSize = getCaptionFontSize(style) * scale;
  const marginV = (style.position === 'top' ? 60 : 80) * scale;

  return {
    fontSize,
    marginV,
    position: style.position,
  };
}

export function getCaptionWordsPerLine(style?: CaptionStyle | null) {
  const value = style?.wordsPerLine;
  return Number.isFinite(value) && Number(value) > 0
    ? Math.max(1, Math.floor(Number(value)))
    : DEFAULT_CAPTION_WORDS_PER_LINE;
}

export function getCaptionFontSize(style: CaptionStyle) {
  return Number.isFinite(style.fontSize) && style.fontSize > 0 ? style.fontSize : 48;
}

export function getEffectiveCaptionAnimation(style: CaptionStyle): NonNullable<CaptionStyle['animation']> {
  if (style.animation === 'pop' || style.animation === 'karaoke') return style.animation;
  return style.preset === 'karaoke' ? 'karaoke' : 'none';
}

function clampPercent(value: unknown, fallback: number) {
  const numeric = typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')
    ? Number(value)
    : Number.NaN;
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(100, numeric));
}

function isAspectRatio(value: unknown): value is ClipPresentationAspectRatio {
  return value === 'source' || value === 'vertical' || value === 'square';
}

function isCaptionMode(value: unknown): value is ClipPresentationCaptions {
  return value === 'none' || value === 'burn-in' || value === 'sidecar';
}
