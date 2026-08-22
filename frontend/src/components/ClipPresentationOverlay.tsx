import { useEffect, useMemo, useState, type RefObject } from 'react';
import type { DeletedRange, EditOperation, Word } from '../types/project';
import {
  ASS_PREVIEW_REFERENCE_HEIGHT,
  chunkClipCaptionWords,
  getActiveCaptionChunk,
  getActiveKaraokeWord,
  getCaptionPreviewGeometry,
  getEffectiveCaptionAnimation,
  getVisibleClipCaptionWords,
  type ClipPresentationPreview,
} from '../utils/clipPresentation';

export type BurnInCapability = 'available' | 'unavailable' | 'unknown';

export interface ClipPresentationOverlayProps {
  preview: ClipPresentationPreview;
  words: Word[];
  deletedRanges: DeletedRange[];
  editOperations: EditOperation[];
  currentTime: number;
  frameRef: RefObject<HTMLDivElement | null>;
  burnInCapability: BurnInCapability;
}

export default function ClipPresentationOverlay({
  preview,
  words,
  deletedRanges,
  editOperations,
  currentTime,
  frameRef,
  burnInCapability,
}: ClipPresentationOverlayProps) {
  const [frameHeight, setFrameHeight] = useState(ASS_PREVIEW_REFERENCE_HEIGHT);
  const style = preview.captionStyle;
  const visibleWords = useMemo(
    () => getVisibleClipCaptionWords(words, preview, deletedRanges, editOperations),
    [deletedRanges, editOperations, preview, words],
  );
  const chunks = useMemo(() => chunkClipCaptionWords(visibleWords, style), [style, visibleWords]);
  const activeChunk = getActiveCaptionChunk(chunks, currentTime);
  const animation = style ? getEffectiveCaptionAnimation(style) : 'none';
  const activeWord = animation === 'karaoke' ? getActiveKaraokeWord(activeChunk, currentTime) : null;
  const geometry = style ? getCaptionPreviewGeometry(style, frameHeight) : null;

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const measure = () => {
      const height = frame.getBoundingClientRect().height;
      if (height > 0) setFrameHeight(height);
    };
    measure();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [frameRef]);

  if (preview.captions === 'none') return null;

  if (preview.captions === 'sidecar') {
    return (
      <div className="pointer-events-none absolute right-2 top-2 rounded bg-black/70 px-2 py-1 text-[10px] text-white" role="status">
        SRT sidecar — captions are not burned into this preview.
      </div>
    );
  }

  const capabilityNotice = burnInCapability === 'unavailable'
    ? "Burn-in captions aren't available on this setup. Export will include an SRT caption file instead."
    : burnInCapability === 'unknown'
      ? 'Burn-in capability is unknown; export will decide.'
      : '';

  return (
    <div className="pointer-events-none absolute inset-0" aria-label="Clip caption preview">
      {capabilityNotice && (
        <div className="absolute inset-x-2 top-2 rounded bg-black/75 px-2 py-1 text-center text-[10px] leading-4 text-white" role="status">
          {capabilityNotice}
        </div>
      )}
      {style && activeChunk && geometry && (
        <div
          className="absolute inset-x-0 flex justify-center px-2"
          style={getCaptionPositionStyle(style.position, geometry.marginV)}
        >
          <div
            key={`${activeChunk.start}-${activeChunk.end}-${animation}`}
            className={`max-w-[88%] rounded px-2 py-1 text-center leading-tight ${animation === 'pop' ? 'clip-caption-pop' : ''}`}
            style={{
              color: style.fontColor,
              backgroundColor: style.backgroundColor,
              fontFamily: style.fontName,
              fontSize: `${geometry.fontSize}px`,
              fontWeight: style.bold ? 800 : 500,
            }}
          >
            {activeChunk.words.map((word) => (
              <span
                key={`${word.sourceIndex}-${word.start}`}
                style={{ color: word.sourceIndex === activeWord?.sourceIndex ? style.highlightColor || style.fontColor : undefined }}
              >
                {word.word}{' '}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function getCaptionPositionStyle(position: NonNullable<ClipPresentationPreview['captionStyle']>['position'], marginV: number) {
  if (position === 'top') return { top: `${marginV}px` };
  if (position === 'center') return { top: '50%', transform: 'translateY(-50%)' };
  return { bottom: `${marginV}px` };
}
