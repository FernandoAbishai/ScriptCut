import { useCallback, useRef, useEffect } from 'react';
import { useEditorStore } from '../store/editorStore';
import { getPlayableSeekTime, getPreviewAudioLayer, type SeekDirection } from '../utils/playback';

export function useVideoSync(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const rafRef = useRef<number>(0);
  const lastPublishedTimeRef = useRef(-1);
  const lastSeekRequestIdRef = useRef(0);
  const noiseRef = useRef<{
    context: AudioContext;
    source: AudioBufferSourceNode;
    gain: GainNode;
  } | null>(null);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const setDuration = useEditorStore((s) => s.setDuration);
  const setIsPlaying = useEditorStore((s) => s.setIsPlaying);
  const deletedRanges = useEditorStore((s) => s.deletedRanges);
  const editOperations = useEditorStore((s) => s.editOperations);
  const previewCuts = useEditorStore((s) => s.previewCuts);
  const seekRequest = useEditorStore((s) => s.seekRequest);
  const previewRangeEnd = useEditorStore((s) => s.previewRangeEnd);
  const clearPreviewRange = useEditorStore((s) => s.clearPreviewRange);

  const publishCurrentTime = useCallback(
    (time: number, force = false) => {
      if (!force && Math.abs(time - lastPublishedTimeRef.current) < 0.05) return;
      lastPublishedTimeRef.current = time;
      setCurrentTime(time);
    },
    [setCurrentTime],
  );

  const seekTo = useCallback(
    (time: number, direction: SeekDirection = 'forward') => {
      if (videoRef.current) {
        const nextTime = getPlayableSeekTime(time, deletedRanges, previewCuts, direction);
        videoRef.current.currentTime = nextTime;
        publishCurrentTime(nextTime, true);
      }
    },
    [videoRef, previewCuts, deletedRanges, publishCurrentTime],
  );

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
    } else {
      videoRef.current.pause();
    }
  }, [videoRef]);

  const ensureRoomTone = useCallback(() => {
    if (noiseRef.current) return noiseRef.current;

    const context = new AudioContext();
    const bufferSize = context.sampleRate * 2;
    const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
    const channel = buffer.getChannelData(0);
    let previous = 0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      previous = (previous + 0.02 * white) / 1.02;
      channel[i] = previous * 0.35;
    }

    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.loop = true;
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(context.destination);
    source.start();

    noiseRef.current = { context, source, gain };
    return noiseRef.current;
  }, []);

  const setRoomToneActive = useCallback(
    (active: boolean) => {
      if (!active) {
        if (noiseRef.current) noiseRef.current.gain.gain.value = 0;
        return;
      }

      const noise = ensureRoomTone();
      if (noise.context.state === 'suspended') {
        void noise.context.resume();
      }
      noise.gain.gain.value = 0.012;
    },
    [ensureRoomTone],
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const syncPreviewFrame = () => {
      if (!video.paused && !video.ended) {
        const t = video.currentTime;
        if (previewRangeEnd !== null && t >= previewRangeEnd) {
          video.currentTime = previewRangeEnd;
          publishCurrentTime(previewRangeEnd, true);
          clearPreviewRange();
          video.pause();
          return;
        }
        const skippedTime = getPlayableSeekTime(t, deletedRanges, previewCuts, 'forward');

        if (skippedTime !== t) {
          video.currentTime = skippedTime;
          publishCurrentTime(skippedTime, true);
          rafRef.current = requestAnimationFrame(syncPreviewFrame);
          return;
        }

        const audioLayer = getPreviewAudioLayer(t, editOperations, previewCuts);
        video.muted = audioLayer === 'mute' || audioLayer === 'room-tone';
        setRoomToneActive(audioLayer === 'room-tone');

        publishCurrentTime(t);
      }

      rafRef.current = requestAnimationFrame(syncPreviewFrame);
    };

    const onTimeUpdate = () => {
      const t = video.currentTime;
      if (previewRangeEnd !== null && t >= previewRangeEnd) {
        video.currentTime = previewRangeEnd;
        publishCurrentTime(previewRangeEnd, true);
        clearPreviewRange();
        video.pause();
        return;
      }
      const audioLayer = getPreviewAudioLayer(t, editOperations, previewCuts);
      video.muted = audioLayer === 'mute' || audioLayer === 'room-tone';
      setRoomToneActive(audioLayer === 'room-tone' && !video.paused && !video.ended);
      publishCurrentTime(t);
    };

    const onPlay = () => {
      setIsPlaying(true);
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(syncPreviewFrame);
    };
    const onPause = () => {
      setIsPlaying(false);
      video.muted = false;
      setRoomToneActive(false);
      cancelAnimationFrame(rafRef.current);
    };
    const onLoadedMetadata = () => setDuration(video.duration);

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('loadedmetadata', onLoadedMetadata);

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.muted = false;
      setRoomToneActive(false);
      cancelAnimationFrame(rafRef.current);
    };
  }, [videoRef, deletedRanges, editOperations, previewCuts, previewRangeEnd, clearPreviewRange, publishCurrentTime, setIsPlaying, setDuration, setRoomToneActive]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !seekRequest) return;
    if (seekRequest.id === lastSeekRequestIdRef.current) return;
    lastSeekRequestIdRef.current = seekRequest.id;

    const nextTime = getPlayableSeekTime(
      seekRequest.time,
      deletedRanges,
      previewCuts,
      seekRequest.direction,
    );
    video.currentTime = nextTime;
    publishCurrentTime(nextTime, true);

    if (seekRequest.play) {
      void video.play();
    }
  }, [videoRef, seekRequest, deletedRanges, previewCuts, publishCurrentTime]);

  useEffect(() => {
    return () => {
      if (!noiseRef.current) return;
      noiseRef.current.source.stop();
      void noiseRef.current.context.close();
      noiseRef.current = null;
    };
  }, []);

  return { seekTo, togglePlay };
}
