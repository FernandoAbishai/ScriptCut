import { useRef, useCallback, useState, useEffect } from 'react';
import { useEditorStore } from '../store/editorStore';
import { useVideoSync } from '../hooks/useVideoSync';
import { Play, Pause, Scissors, SkipBack, SkipForward, Volume2 } from 'lucide-react';

export default function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoUrl = useEditorStore((s) => s.videoUrl);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const duration = useEditorStore((s) => s.duration);
  const deletedRanges = useEditorStore((s) => s.deletedRanges);
  const editOperations = useEditorStore((s) => s.editOperations);
  const previewCuts = useEditorStore((s) => s.previewCuts);
  const previewAspectRatio = useEditorStore((s) => s.previewAspectRatio);
  const previewReframe = useEditorStore((s) => s.exportOptions.reframe || { x: 50, y: 50 });
  const setPreviewCuts = useEditorStore((s) => s.setPreviewCuts);
  const { seekTo, togglePlay } = useVideoSync(videoRef);

  const [displayTime, setDisplayTime] = useState(0);
  const hasPlaybackEdits =
    deletedRanges.length > 0 ||
    editOperations.some((operation) => operation.kind === 'mute' || operation.kind === 'room-tone');

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let raf = 0;
    const tick = () => {
      setDisplayTime(video.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [videoUrl]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      seekTo(ratio * duration);
    },
    [seekTo, duration],
  );

  const skip = useCallback(
    (delta: number) => {
      const video = videoRef.current;
      if (!video) return;
      seekTo(
        Math.max(0, Math.min(duration, video.currentTime + delta)),
        delta < 0 ? 'backward' : 'forward',
      );
    },
    [seekTo, duration],
  );

  if (!videoUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center text-editor-text-muted text-sm">
        No video loaded
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-1 relative flex items-center justify-center bg-black rounded-lg overflow-hidden min-h-0">
        <video
          ref={videoRef}
          src={videoUrl}
          className="max-w-full max-h-full object-contain"
          playsInline
          onClick={togglePlay}
        />
        {previewAspectRatio !== 'source' && (
          <div className="pointer-events-none absolute inset-3 overflow-hidden">
            <div
              className={`absolute max-h-full max-w-full border-2 border-editor-accent/80 bg-black/10 shadow-[0_0_0_9999px_rgba(0,0,0,0.28)] ${
                previewAspectRatio === 'vertical' ? 'aspect-[9/16] h-full' : 'aspect-square h-[82%]'
              }`}
              style={{
                left: `${previewReframe.x}%`,
                top: `${previewReframe.y}%`,
                transform: `translate(-${previewReframe.x}%, -${previewReframe.y}%)`,
              }}
            >
              <div className="absolute inset-x-0 top-[12%] border-t border-white/25" />
              <div className="absolute inset-x-0 bottom-[12%] border-t border-white/25" />
              <div className="absolute inset-y-0 left-[10%] border-l border-white/20" />
              <div className="absolute inset-y-0 right-[10%] border-l border-white/20" />
              <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                {previewAspectRatio === 'vertical' ? '9:16 safe frame' : '1:1 safe frame'}
              </span>
              <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white">
                {Math.round(previewReframe.x)} / {Math.round(previewReframe.y)}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="pt-2 space-y-1.5 shrink-0">
        <div
          className="h-1.5 bg-editor-border rounded-full cursor-pointer group"
          onClick={handleProgressClick}
        >
          <div
            className="h-full bg-editor-accent rounded-full relative transition-all group-hover:h-2"
            style={{ width: duration > 0 ? `${(displayTime / duration) * 100}%` : '0%' }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <ControlButton onClick={() => skip(-5)} title="Back 5s">
              <SkipBack className="w-4 h-4" />
            </ControlButton>
            <ControlButton onClick={togglePlay} title={isPlaying ? 'Pause' : 'Play'} primary>
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </ControlButton>
            <ControlButton onClick={() => skip(5)} title="Forward 5s">
              <SkipForward className="w-4 h-4" />
            </ControlButton>
            <ControlButton
              onClick={() => setPreviewCuts(!previewCuts)}
              title={previewCuts ? 'Preview edited playback' : 'Preview original media'}
              active={previewCuts}
              disabled={!hasPlaybackEdits}
            >
              <Scissors className="w-4 h-4" />
            </ControlButton>
          </div>

          <div className="flex items-center gap-3 text-xs text-editor-text-muted">
            {hasPlaybackEdits && (
              <span className="hidden sm:inline">
                {previewCuts ? 'Edited preview' : 'Original playback'}
              </span>
            )}
            <Volume2 className="w-3.5 h-3.5" />
            <span className="font-mono">
              {formatTime(displayTime)} / {formatTime(duration)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ControlButton({
  children,
  onClick,
  title,
  primary,
  active,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  primary?: boolean;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`p-1.5 rounded-md transition-colors ${
        primary
          ? 'bg-editor-accent/20 text-editor-accent hover:bg-editor-accent/30'
          : active
            ? 'bg-editor-accent/15 text-editor-accent hover:bg-editor-accent/25'
          : 'text-editor-text-muted hover:text-editor-text hover:bg-editor-surface'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      {children}
    </button>
  );
}
