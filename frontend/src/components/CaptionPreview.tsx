import type { CaptionStyle } from '../types/project';
import { getCaptionAnimationLabel, getCaptionPositionClass, getCaptionPreviewWords, getCaptionPresetLabel } from '../utils/captionDesigner';

export default function CaptionPreview({ style }: { style: CaptionStyle }) {
  const words = getCaptionPreviewWords(style);
  const activeIndex = style.animation === 'karaoke' ? Math.min(1, words.length - 1) : -1;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] text-editor-text-muted">
        <span>{getCaptionPresetLabel(style.preset)} preview</span>
        <span>{getCaptionAnimationLabel(style.animation)}</span>
      </div>
      <div className="mx-auto flex aspect-[9/16] max-h-56 w-full max-w-[9rem] rounded border border-editor-border bg-black/80 p-2">
        <div className={`flex h-full w-full justify-center border border-dashed border-white/20 px-1 ${getCaptionPositionClass(style.position)}`}>
          <div
            className="max-w-full rounded px-2 py-1 text-center leading-tight"
            style={{
              color: style.fontColor,
              backgroundColor: style.backgroundColor,
              fontSize: `${Math.max(12, Math.round(style.fontSize * 0.32))}px`,
              fontWeight: style.bold ? 800 : 500,
              transform: style.animation === 'pop' ? 'scale(1.04)' : undefined,
              transition: style.animation === 'pop' ? 'transform 180ms ease-out' : undefined,
            }}
          >
            {words.map((word, index) => (
              <span
                key={`${word}-${index}`}
                style={{
                  color: index === activeIndex ? style.highlightColor || style.fontColor : undefined,
                }}
              >
                {word}{' '}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
