import { useRef, useCallback, useState, useEffect } from 'react';
import { useEditorStore } from '../store/editorStore';
import { useVideoSync } from '../hooks/useVideoSync';
import { getPlaybackTimeState, previewToSourceTime } from '../utils/playback';
import { getCapturedSourceAspectRatio, getClipFramePreviewStyle } from '../utils/clipPresentation';
import ClipPresentationOverlay, { type BurnInCapability } from './ClipPresentationOverlay';
import { Play, Pause, Scissors, SkipBack, SkipForward } from 'lucide-react';

const SAFE_SOURCE_ASPECT_RATIO = 16 / 9;

export default function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoUrl = useEditorStore((s) => s.videoUrl);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const duration = useEditorStore((s) => s.duration);
  const words = useEditorStore((s) => s.words);
  const deletedRanges = useEditorStore((s) => s.deletedRanges);
  const editOperations = useEditorStore((s) => s.editOperations);
  const editedPreviewEnabled = useEditorStore((s) => s.previewCuts);
  const previewSourceRange = useEditorStore((s) => s.previewSourceRange);
  const previewCuts = editedPreviewEnabled && !previewSourceRange;
  const previewAspectRatio = useEditorStore((s) => s.previewAspectRatio);
  const previewReframe = useEditorStore((s) => s.exportOptions.reframe || { x: 50, y: 50 });
  const clipPresentationPreview = useEditorStore((s) => s.clipPresentationPreview);
  const clipPresentationCaptions = useEditorStore((s) => s.clipPresentationPreview?.captions);
  const clipPresentationKey = useEditorStore((s) => s.clipPresentationPreview?.key);
  const currentTime = useEditorStore((s) => s.currentTime);
  const backendUrl = useEditorStore((s) => s.backendUrl);
  const setPreviewCuts = useEditorStore((s) => s.setPreviewCuts);
  const { seekTo, togglePlay } = useVideoSync(videoRef);

  const frameRef = useRef<HTMLDivElement>(null);
  const [displayTime, setDisplayTime] = useState(0);
  const [sourceAspectRatio, setSourceAspectRatio] = useState(SAFE_SOURCE_ASPECT_RATIO);
  const [burnInCapability, setBurnInCapability] = useState<BurnInCapability>('unknown');
  const hasPlaybackEdits =
    deletedRanges.length > 0 ||
    editOperations.some((operation) => operation.kind === 'mute' || operation.kind === 'room-tone');
  const playbackState = getPlaybackTimeState(displayTime, duration, deletedRanges, previewCuts);
  const progressPercent = playbackState.progress * 100;

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
  }, [videoUrl, duration, deletedRanges, previewCuts]);

  useEffect(() => {
    setSourceAspectRatio(SAFE_SOURCE_ASPECT_RATIO);
  }, [videoUrl]);

  useEffect(() => {
    if (clipPresentationCaptions !== 'burn-in') {
      setBurnInCapability('unknown');
      return;
    }

    let canceled = false;
    setBurnInCapability('unknown');
    fetch(`${backendUrl}/system/checks`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { checks?: { captions?: { ok?: unknown } } } | null) => {
        if (canceled) return;
        setBurnInCapability(data?.checks?.captions?.ok === true ? 'available' : data?.checks?.captions?.ok === false ? 'unavailable' : 'unknown');
      })
      .catch(() => {
        if (!canceled) setBurnInCapability('unknown');
      });

    return () => {
      canceled = true;
    };
  }, [backendUrl, clipPresentationCaptions, clipPresentationKey]);

  const handleLoadedMetadata = useCallback((event: React.SyntheticEvent<HTMLVideoElement>) => {
    const { videoWidth, videoHeight } = event.currentTarget;
    const nextAspectRatio = getCapturedSourceAspectRatio(videoWidth, videoHeight);
    if (nextAspectRatio !== null) setSourceAspectRatio(nextAspectRatio);
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const skip = useCallback(
    (delta: number) => {
      const video = videoRef.current;
      if (!video) return;
      const targetPreviewTime = playbackState.previewTime + delta;
      const sourceTime = previewToSourceTime(targetPreviewTime, duration, deletedRanges, previewCuts);
      seekTo(sourceTime, delta < 0 ? 'backward' : 'forward');
    },
    [seekTo, duration, deletedRanges, playbackState.previewTime, previewCuts],
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
        <div
          ref={clipPresentationPreview ? frameRef : undefined}
          className={clipPresentationPreview
            ? `relative h-full max-h-full max-w-full ${
                clipPresentationPreview.aspectRatio === 'vertical'
                  ? 'aspect-[9/16]'
                  : clipPresentationPreview.aspectRatio === 'square'
                    ? 'aspect-square'
                    : ''
              }`
            : 'contents'}
          style={clipPresentationPreview?.aspectRatio === 'source' ? { aspectRatio: sourceAspectRatio } : undefined}
        >
          <video
            ref={videoRef}
            src={videoUrl}
            className={clipPresentationPreview ? 'h-full w-full' : 'max-w-full max-h-full object-contain'}
            style={clipPresentationPreview
              ? getClipFramePreviewStyle(clipPresentationPreview.aspectRatio, clipPresentationPreview.reframe)
              : undefined}
            playsInline
            onClick={togglePlay}
            onLoadedMetadata={handleLoadedMetadata}
          />
          {clipPresentationPreview && (
            <ClipPresentationOverlay
              preview={clipPresentationPreview}
              words={words}
              deletedRanges={deletedRanges}
              editOperations={editOperations}
              currentTime={currentTime}
              frameRef={frameRef}
              burnInCapability={burnInCapability}
            />
          )}
          {clipPresentationPreview && clipPresentationPreview.aspectRatio !== 'source' && (
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute inset-x-0 top-[12%] border-t border-white/20" />
              <div className="absolute inset-x-0 bottom-[12%] border-t border-white/20" />
              <div className="absolute inset-y-0 left-[10%] border-l border-white/15" />
              <div className="absolute inset-y-0 right-[10%] border-l border-white/15" />
              <span className="absolute left-2 top-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
                {clipPresentationPreview.aspectRatio === 'vertical' ? '9:16 composition guide' : '1:1 composition guide'}
              </span>
            </div>
          )}
        </div>
        {!clipPresentationPreview && previewAspectRatio !== 'source' && (
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

      <div className="shrink-0 pt-1.5">
        <input
          className="workspace-seek"
          style={{
            backgroundImage: `linear-gradient(to right, var(--workspace-focus) ${progressPercent}%, var(--workspace-line) ${progressPercent}%)`,
          }}
          type="range"
          min={0}
          max={playbackState.previewDuration}
          step="0.1"
          value={playbackState.previewTime}
          disabled={playbackState.previewDuration === 0}
          aria-label="Playback position"
          aria-valuetext={formatTime(playbackState.previewTime) + ' of ' + formatTime(playbackState.previewDuration)}
          onChange={(event) => {
            const time = event.currentTarget.valueAsNumber;
            const sourceTime = previewToSourceTime(time, duration, deletedRanges, previewCuts);
            seekTo(sourceTime, time < playbackState.previewTime ? 'backward' : 'forward');
          }}
        />

        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
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
              onClick={() => setPreviewCuts(!editedPreviewEnabled)}
              title="Preview edited playback"
              active={previewCuts}
              disabled={!hasPlaybackEdits}
            >
              <Scissors className="w-4 h-4" />
            </ControlButton>
          </div>

          <div className="flex flex-wrap items-center gap-x-2 text-xs text-editor-text-muted">
            {hasPlaybackEdits && (
              <span className="hidden sm:inline">
                {previewSourceRange ? 'Cut source preview' : previewCuts ? 'Edited preview' : 'Original playback'}
              </span>
            )}
            <span className="font-mono">
              {formatTime(playbackState.previewTime)} / {formatTime(playbackState.previewDuration)}
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
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
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
