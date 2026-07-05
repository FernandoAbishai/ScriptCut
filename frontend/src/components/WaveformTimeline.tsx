import { useRef, useEffect, useCallback, useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import { ZoomIn, ZoomOut, AlertTriangle } from 'lucide-react';
import { getPlayableSeekTime } from '../utils/playback';

export default function WaveformTimeline() {
  const waveCanvasRef = useRef<HTMLCanvasElement>(null);
  const headCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [waveformRevision, setWaveformRevision] = useState(0);

  const videoUrl = useEditorStore((s) => s.videoUrl);
  const videoPath = useEditorStore((s) => s.videoPath);
  const duration = useEditorStore((s) => s.duration);
  const words = useEditorStore((s) => s.words);
  const deletedRanges = useEditorStore((s) => s.deletedRanges);
  const editOperations = useEditorStore((s) => s.editOperations);
  const selectedWordIndices = useEditorStore((s) => s.selectedWordIndices);
  const previewCuts = useEditorStore((s) => s.previewCuts);
  const currentTime = useEditorStore((s) => s.currentTime);
  const requestSeek = useEditorStore((s) => s.requestSeek);
  const setSelectedWordIndices = useEditorStore((s) => s.setSelectedWordIndices);

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const rafRef = useRef(0);
  const currentTimeRef = useRef(0);
  const dragStartTimeRef = useRef<number | null>(null);
  const dragMovedRef = useRef(false);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  const drawStaticWaveform = useCallback(() => {
    const canvas = waveCanvasRef.current;
    const buffer = audioBufferRef.current;
    const timelineDuration = buffer?.duration || duration;
    if (!canvas || timelineDuration <= 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const channelData = buffer?.getChannelData(0);
    const samplesPerPixel = channelData ? Math.max(1, Math.floor(channelData.length / width)) : 0;

    ctx.clearRect(0, 0, width, height);

    for (const range of deletedRanges) {
      const x1 = (range.start / timelineDuration) * width;
      const x2 = (range.end / timelineDuration) * width;
      ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
      ctx.fillRect(x1, 0, x2 - x1, height);
    }

    for (const operation of editOperations) {
      const x1 = (operation.start / timelineDuration) * width;
      const x2 = (operation.end / timelineDuration) * width;
      ctx.fillStyle =
        operation.kind === 'mute'
          ? 'rgba(99, 102, 241, 0.18)'
          : operation.kind === 'room-tone'
            ? 'rgba(245, 158, 11, 0.18)'
          : operation.kind === 'caption-only'
            ? 'rgba(148, 163, 184, 0.18)'
            : 'rgba(34, 197, 94, 0.12)';
      ctx.fillRect(x1, 0, x2 - x1, height);
    }

    if (selectedWordIndices.length > 0 && words.length > 0) {
      const selectedRanges = getSelectedTimeRanges(words, selectedWordIndices);
      for (const range of selectedRanges) {
        const x1 = (range.start / timelineDuration) * width;
        const x2 = (range.end / timelineDuration) * width;
        ctx.fillStyle = 'rgba(99, 102, 241, 0.28)';
        ctx.fillRect(x1, 0, Math.max(2, x2 - x1), height);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x1, 0.5, Math.max(2, x2 - x1), height - 1);
      }
    }

    const mid = height / 2;
    ctx.beginPath();
    ctx.strokeStyle = '#4a4d5e';
    ctx.lineWidth = 1;

    if (!channelData) {
      ctx.moveTo(0, mid);
      ctx.lineTo(width, mid);
      ctx.stroke();

      ctx.beginPath();
      ctx.strokeStyle = '#2a2d3a';
      const tickCount = Math.max(2, Math.min(12, Math.floor(timelineDuration / 10)));
      for (let tick = 0; tick <= tickCount; tick++) {
        const x = (tick / tickCount) * width;
        ctx.moveTo(x, height * 0.25);
        ctx.lineTo(x, height * 0.75);
      }
      ctx.stroke();
      return;
    }

    for (let x = 0; x < width; x++) {
      const start = x * samplesPerPixel;
      const end = Math.min(start + samplesPerPixel, channelData.length);

      let min = 0;
      let max = 0;
      for (let i = start; i < end; i++) {
        if (channelData[i] < min) min = channelData[i];
        if (channelData[i] > max) max = channelData[i];
      }

      const yMin = mid + min * mid * 0.9;
      const yMax = mid + max * mid * 0.9;
      ctx.moveTo(x, yMin);
      ctx.lineTo(x, yMax);
    }
    ctx.stroke();
  }, [deletedRanges, duration, editOperations, selectedWordIndices, words]);

  useEffect(() => {
    if (!videoUrl || !videoPath) return;
    let canceled = false;
    const controller = new AbortController();

    setAudioError(null);
    audioBufferRef.current = null;
    setWaveformRevision((revision) => revision + 1);

    const loadAudio = async () => {
      try {
        await audioContextRef.current?.close();
        const ctx = new AudioContext();
        audioContextRef.current = ctx;

        const response = await fetch(videoUrl, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        if (canceled) return;
        audioBufferRef.current = audioBuffer;
        setWaveformRevision((revision) => revision + 1);
      } catch (err) {
        if (canceled || (err instanceof DOMException && err.name === 'AbortError')) return;
        console.warn('Could not decode audio for waveform:', err);
        audioBufferRef.current = null;
        setAudioError('Waveform unavailable — audio could not be decoded');
        setWaveformRevision((revision) => revision + 1);
      }
    };

    loadAudio();

    return () => {
      canceled = true;
      controller.abort();
      void audioContextRef.current?.close();
      audioContextRef.current = null;
    };
  }, [videoUrl, videoPath]);

  // Redraw static layer when deletedRanges change
  useEffect(() => {
    drawStaticWaveform();
  }, [drawStaticWaveform, waveformRevision]);

  useEffect(() => {
    drawStaticWaveform();
  }, [drawStaticWaveform, zoom]);

  // Lightweight RAF loop for playhead only -- reads store time from a ref,
  // never triggers React re-renders
  useEffect(() => {
    const headCanvas = headCanvasRef.current;
    const waveCanvas = waveCanvasRef.current;
    if (!headCanvas || !waveCanvas) return;

    const tick = () => {
      const ctx = headCanvas.getContext('2d');
      if (!ctx) { rafRef.current = requestAnimationFrame(tick); return; }

      const dur = audioBufferRef.current?.duration || duration;

      const dpr = window.devicePixelRatio || 1;
      const rect = headCanvas.getBoundingClientRect();
      if (headCanvas.width !== waveCanvas.width || headCanvas.height !== waveCanvas.height) {
        headCanvas.width = rect.width * dpr;
        headCanvas.height = rect.height * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const width = rect.width;
      const height = rect.height;
      ctx.clearRect(0, 0, width, height);

      if (dur > 0) {
        const px = (currentTimeRef.current / dur) * width;
        ctx.beginPath();
        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 2;
        ctx.moveTo(px, 0);
        ctx.lineTo(px, height);
        ctx.stroke();
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [videoUrl, duration]);

  useEffect(() => {
    const observer = new ResizeObserver(() => {
      drawStaticWaveform();
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [drawStaticWaveform]);

  const timeFromPointer = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!headCanvasRef.current || duration === 0) return;
      const rect = headCanvasRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      return ratio * duration;
    },
    [duration],
  );

  const selectWordsForTimeRange = useCallback(
    (startTime: number, endTime: number) => {
      if (words.length === 0) return;
      const start = Math.min(startTime, endTime);
      const end = Math.max(startTime, endTime);
      const indices = [];
      for (let index = 0; index < words.length; index++) {
        const word = words[index];
        if (word.end >= start && word.start <= end) indices.push(index);
      }
      setSelectedWordIndices(indices);
    },
    [setSelectedWordIndices, words],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rawTime = timeFromPointer(e);
      if (rawTime === undefined) return;
      dragStartTimeRef.current = rawTime;
      dragMovedRef.current = false;
    },
    [timeFromPointer],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (dragStartTimeRef.current === null) return;
      const rawTime = timeFromPointer(e);
      if (rawTime === undefined) return;
      if (Math.abs(rawTime - dragStartTimeRef.current) < 0.05) return;
      dragMovedRef.current = true;
      selectWordsForTimeRange(dragStartTimeRef.current, rawTime);
    },
    [selectWordsForTimeRange, timeFromPointer],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rawTime = timeFromPointer(e);
      const startTime = dragStartTimeRef.current;
      dragStartTimeRef.current = null;
      if (rawTime === undefined || startTime === null) return;

      if (dragMovedRef.current) {
        selectWordsForTimeRange(startTime, rawTime);
        const direction = rawTime < currentTime ? 'backward' : 'forward';
        const nextTime = getPlayableSeekTime(Math.min(startTime, rawTime), deletedRanges, previewCuts, direction);
        requestSeek(nextTime, direction, false);
        dragMovedRef.current = false;
        return;
      }

      const direction = rawTime < currentTime ? 'backward' : 'forward';
      const nextTime = getPlayableSeekTime(rawTime, deletedRanges, previewCuts, direction);
      requestSeek(nextTime, direction, false);
    },
    [currentTime, deletedRanges, previewCuts, requestSeek, selectWordsForTimeRange, timeFromPointer],
  );

  if (!videoUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center text-editor-text-muted text-xs">
        Load a video to see the waveform
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-1 shrink-0">
        <span className="text-[10px] text-editor-text-muted font-medium uppercase tracking-wider">
          Timeline
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoom((current) => Math.max(1, current - 0.5))}
            disabled={zoom <= 1}
            className="p-0.5 text-editor-text-muted hover:text-editor-text"
            title="Zoom out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setZoom((current) => Math.min(8, current + 0.5))}
            className="p-0.5 text-editor-text-muted hover:text-editor-text"
            title="Zoom in"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="flex-1 relative overflow-x-auto">
        <div className="relative h-full min-w-full" style={{ width: `${zoom * 100}%` }}>
          <canvas ref={waveCanvasRef} className="absolute inset-0 h-full w-full" />
          <canvas
            ref={headCanvasRef}
            className="absolute inset-0 h-full w-full cursor-crosshair"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => {
              dragStartTimeRef.current = null;
              dragMovedRef.current = false;
            }}
          />
        </div>
        {audioError && (
          <div className="pointer-events-none absolute inset-x-3 top-2 flex items-center gap-1.5 rounded bg-editor-bg/80 px-2 py-1 text-[10px] text-editor-text-muted">
            <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />
            <span>{audioError}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function getSelectedTimeRanges(words: Array<{ start: number; end: number }>, selectedWordIndices: number[]) {
  const sorted = [...new Set(selectedWordIndices)]
    .filter((index) => index >= 0 && index < words.length)
    .sort((a, b) => a - b);
  if (sorted.length === 0) return [];

  const ranges: Array<{ start: number; end: number }> = [];
  let start = sorted[0];
  let previous = sorted[0];

  const flush = () => {
    ranges.push({ start: words[start].start, end: words[previous].end });
  };

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === previous + 1) {
      previous = sorted[i];
      continue;
    }
    flush();
    start = sorted[i];
    previous = sorted[i];
  }
  flush();
  return ranges;
}
