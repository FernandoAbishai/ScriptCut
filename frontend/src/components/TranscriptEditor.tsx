import { useCallback, useRef, useEffect, useMemo, useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import { useAIStore } from '../store/aiStore';
import { Virtuoso } from 'react-virtuoso';
import type { VirtuosoHandle } from 'react-virtuoso';
import { CaptionsOff, Copy, Film, Pencil, Play, RotateCcw, Trash2, UserRoundCheck, VolumeX, Waves, X } from 'lucide-react';
import type { ClipDraft } from '../types/project';
import { formatSelectionDuration, summarizeWordSelection } from '../utils/transcriptSelection';

export default function TranscriptEditor() {
  const words = useEditorStore((s) => s.words);
  const segments = useEditorStore((s) => s.segments);
  const deletedRanges = useEditorStore((s) => s.deletedRanges);
  const editOperations = useEditorStore((s) => s.editOperations);
  const selectedWordIndices = useEditorStore((s) => s.selectedWordIndices);
  const hoveredWordIndex = useEditorStore((s) => s.hoveredWordIndex);
  const activeWordIndex = useEditorStore((s) => s.activeWordIndex);
  const setSelectedWordIndices = useEditorStore((s) => s.setSelectedWordIndices);
  const setHoveredWordIndex = useEditorStore((s) => s.setHoveredWordIndex);
  const deleteSelectedWords = useEditorStore((s) => s.deleteSelectedWords);
  const muteSelectedWords = useEditorStore((s) => s.muteSelectedWords);
  const replaceSelectedWordsWithRoomTone = useEditorStore((s) => s.replaceSelectedWordsWithRoomTone);
  const hideSelectedWordsFromCaptions = useEditorStore((s) => s.hideSelectedWordsFromCaptions);
  const deleteSpeakerWords = useEditorStore((s) => s.deleteSpeakerWords);
  const renameSpeaker = useEditorStore((s) => s.renameSpeaker);
  const selectSpeakerWords = useEditorStore((s) => s.selectSpeakerWords);
  const restoreRange = useEditorStore((s) => s.restoreRange);
  const restoreEditOperation = useEditorStore((s) => s.restoreEditOperation);
  const requestSeek = useEditorStore((s) => s.requestSeek);
  const setClipDrafts = useAIStore((s) => s.setClipDrafts);

  const selectionStart = useRef<number | null>(null);
  const wasDragging = useRef(false);
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const activeSegmentIndexRef = useRef(-1);
  const selectedSegmentIndexRef = useRef(-1);
  const userScrollPauseUntilRef = useRef(0);
  const userScrollTimerRef = useRef(0);

  const deletedSet = useMemo(() => {
    const s = new Set<number>();
    for (const range of deletedRanges) {
      for (const idx of range.wordIndices) s.add(idx);
    }
    return s;
  }, [deletedRanges]);

  const selectedSet = useMemo(() => new Set(selectedWordIndices), [selectedWordIndices]);
  const operationMap = useMemo(() => {
    const map = new Map<number, typeof editOperations[number]>();
    for (const operation of editOperations) {
      for (const index of operation.wordIndices) map.set(index, operation);
    }
    return map;
  }, [editOperations]);

  const [speakerFilter, setSpeakerFilter] = useState('all');

  const speakers = useMemo(
    () =>
      Array.from(new Set(words.map((word) => word.speaker).filter(Boolean) as string[])).sort(),
    [words],
  );

  const visibleSegments = useMemo(() => {
    if (speakerFilter === 'all') return segments.map((segment, index) => ({ segment, index }));
    return segments
      .map((segment, index) => ({ segment, index }))
      .filter(({ segment }) => segment.speaker === speakerFilter || segment.words.some((word) => word.speaker === speakerFilter));
  }, [segments, speakerFilter]);

  const visibleWordCount = useMemo(() => {
    if (speakerFilter === 'all') return words.length;
    return words.filter((word) => word.speaker === speakerFilter).length;
  }, [speakerFilter, words]);
  const nonDeleteLayerCount = useMemo(
    () => editOperations.filter((operation) => operation.kind !== 'delete').length,
    [editOperations],
  );
  const selectionSummary = useMemo(
    () => summarizeWordSelection(selectedWordIndices, words),
    [selectedWordIndices, words],
  );

  // Auto-scroll to active segment via Virtuoso
  useEffect(() => {
    if (activeWordIndex < 0 || visibleSegments.length === 0) return;
    const segIdx = visibleSegments.findIndex(({ segment }) => {
      const start = segment.globalStartIndex ?? 0;
      return activeWordIndex >= start && activeWordIndex < start + segment.words.length;
    });
    if (
      segIdx >= 0 &&
      segIdx !== activeSegmentIndexRef.current &&
      virtuosoRef.current &&
      Date.now() > userScrollPauseUntilRef.current
    ) {
      activeSegmentIndexRef.current = segIdx;
      virtuosoRef.current.scrollIntoView({ index: segIdx, behavior: 'smooth', align: 'center' });
    }
  }, [activeWordIndex, visibleSegments]);

  useEffect(() => {
    if (selectedWordIndices.length === 0 || visibleSegments.length === 0) {
      selectedSegmentIndexRef.current = -1;
      return;
    }

    const firstSelected = Math.min(...selectedWordIndices);
    const segIdx = visibleSegments.findIndex(({ segment }) => {
      const start = segment.globalStartIndex ?? 0;
      return firstSelected >= start && firstSelected < start + segment.words.length;
    });

    if (
      segIdx >= 0 &&
      segIdx !== selectedSegmentIndexRef.current &&
      virtuosoRef.current &&
      selectionStart.current === null
    ) {
      selectedSegmentIndexRef.current = segIdx;
      virtuosoRef.current.scrollIntoView({ index: segIdx, behavior: 'smooth', align: 'center' });
    }
  }, [selectedWordIndices, visibleSegments]);

  const pauseAutoScroll = useCallback(() => {
    userScrollPauseUntilRef.current = Date.now() + 1800;
    window.clearTimeout(userScrollTimerRef.current);
    userScrollTimerRef.current = window.setTimeout(() => {
      userScrollPauseUntilRef.current = 0;
    }, 1900);
  }, []);

  useEffect(
    () => () => {
      window.clearTimeout(userScrollTimerRef.current);
    },
    [],
  );

  const handleWordMouseDown = useCallback(
    (index: number, e: React.MouseEvent) => {
      e.preventDefault();
      pauseAutoScroll();
      wasDragging.current = false;
      if (e.shiftKey && selectedWordIndices.length > 0) {
        const first = selectedWordIndices[0];
        const start = Math.min(first, index);
        const end = Math.max(first, index);
        const indices = [];
        for (let i = start; i <= end; i++) indices.push(i);
        setSelectedWordIndices(indices);
      } else {
        selectionStart.current = index;
        setSelectedWordIndices([index]);
        requestSeek(words[index]?.start ?? 0, 'forward', false);
      }
    },
    [pauseAutoScroll, requestSeek, selectedWordIndices, setSelectedWordIndices, words],
  );

  const handleWordMouseEnter = useCallback(
    (index: number) => {
      setHoveredWordIndex(index);
      if (selectionStart.current !== null) {
        wasDragging.current = true;
        const start = Math.min(selectionStart.current, index);
        const end = Math.max(selectionStart.current, index);
        const indices = [];
        for (let i = start; i <= end; i++) indices.push(i);
        setSelectedWordIndices(indices);
      }
    },
    [setHoveredWordIndex, setSelectedWordIndices],
  );

  const handleMouseUp = useCallback(() => {
    selectionStart.current = null;
  }, []);

  const handleClickOutside = useCallback(
    (e: React.MouseEvent) => {
      if (wasDragging.current) {
        wasDragging.current = false;
        return;
      }
      if ((e.target as HTMLElement).dataset.wordIndex === undefined) {
        setSelectedWordIndices([]);
      }
    },
    [setSelectedWordIndices],
  );

  const getRangeForWord = useCallback(
    (wordIndex: number) => deletedRanges.find((r) => r.wordIndices.includes(wordIndex)),
    [deletedRanges],
  );

  const handleRenameSpeaker = useCallback(() => {
    if (speakerFilter === 'all') return;
    const nextLabel = window.prompt('Rename speaker', speakerFilter);
    if (nextLabel) {
      renameSpeaker(speakerFilter, nextLabel);
      setSpeakerFilter(nextLabel.trim());
    }
  }, [speakerFilter, renameSpeaker]);

  const handleDeleteSpeaker = useCallback(() => {
    if (speakerFilter === 'all') return;
    const confirmed = window.confirm(`Delete all words from ${speakerFilter}?`);
    if (confirmed) deleteSpeakerWords(speakerFilter);
  }, [speakerFilter, deleteSpeakerWords]);

  const previewSelection = useCallback(() => {
    if (!selectionSummary) return;
    requestSeek(selectionSummary.startTime, 'forward', true);
  }, [requestSeek, selectionSummary]);

  const copySelectionText = useCallback(async () => {
    if (!selectionSummary) return;
    await navigator.clipboard?.writeText(selectionSummary.text);
  }, [selectionSummary]);

  const draftClipFromSelection = useCallback(() => {
    if (!selectionSummary) return;
    const title = selectionSummary.text.split(/\s+/).slice(0, 8).join(' ') || 'Transcript clip';
    const draft: ClipDraft = {
      id: `transcript_clip_${Date.now()}`,
      title,
      reason: 'Created from transcript selection',
      startWordIndex: selectionSummary.startIndex,
      endWordIndex: selectionSummary.endIndex,
      startTime: selectionSummary.startTime,
      endTime: selectionSummary.endTime,
      status: 'draft',
      platform: 'shorts',
      format: 'mp4',
      resolution: '1080p',
      aspectRatio: 'vertical',
      reframe: { x: 50, y: 50 },
      enhanceAudio: false,
      captions: 'burn-in',
      captionStyle: {
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
      backgroundRemoval: { enabled: false, replacement: 'blur', color: '#111827' },
      hook: '',
      description: '',
      caption: '',
      hashtags: [],
      source: 'transcript-selection',
    };
    setClipDrafts((current) => [...current, draft]);
  }, [selectionSummary, setClipDrafts]);

  const renderSegment = useCallback(
    (index: number) => {
      const segment = visibleSegments[index]?.segment;
      if (!segment) return null;
      return (
        <div className="mb-3 px-4">
          {segment.speaker && (
            <div className="text-xs text-editor-accent font-medium mb-1">
              {segment.speaker}
            </div>
          )}
          <p className="text-sm leading-relaxed flex flex-wrap">
            {segment.words.map((word, localIndex) => {
              const globalIndex = (segment.globalStartIndex ?? 0) + localIndex;
              if (speakerFilter !== 'all' && word.speaker !== speakerFilter) return null;
              const isDeleted = deletedSet.has(globalIndex);
              const isSelected = selectedSet.has(globalIndex);
              const isActive = globalIndex === activeWordIndex;
              const isHovered = globalIndex === hoveredWordIndex;
              const deletedRange = isDeleted ? getRangeForWord(globalIndex) : null;
              const operation = operationMap.get(globalIndex);
              const isMuted = operation?.kind === 'mute';
              const isRoomTone = operation?.kind === 'room-tone';
              const isCaptionHidden = operation?.kind === 'caption-only';

              return (
                <span
                  key={globalIndex}
                  id={`word-${globalIndex}`}
                  data-word-index={globalIndex}
                  onMouseDown={(e) => handleWordMouseDown(globalIndex, e)}
                  onMouseEnter={() => handleWordMouseEnter(globalIndex)}
                  onMouseLeave={() => setHoveredWordIndex(null)}
                  className={`
                    relative px-[2px] py-[1px] rounded cursor-pointer transition-colors
                    ${isDeleted ? 'line-through text-editor-text-muted/40 bg-editor-word-deleted' : ''}
                    ${isMuted && !isDeleted ? 'bg-editor-accent/10 text-editor-accent' : ''}
                    ${isRoomTone && !isDeleted && !isMuted ? 'bg-editor-warning/10 text-editor-warning' : ''}
                    ${isCaptionHidden && !isDeleted && !isMuted && !isRoomTone ? 'bg-editor-border/70 text-editor-text-muted' : ''}
                    ${isSelected && !isDeleted ? 'bg-editor-word-selected text-white' : ''}
                    ${isActive && !isDeleted && !isSelected ? 'bg-editor-accent/20 text-editor-accent' : ''}
                    ${isHovered && !isDeleted && !isSelected && !isActive && !isMuted && !isRoomTone && !isCaptionHidden ? 'bg-editor-word-hover' : ''}
                  `}
                >
                  {word.word}{' '}
                  {isDeleted && isHovered && deletedRange && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        restoreRange(deletedRange.id);
                      }}
                      className="absolute -top-5 left-1/2 -translate-x-1/2 flex items-center gap-0.5 px-1.5 py-0.5 bg-editor-surface border border-editor-border rounded text-[10px] text-editor-success whitespace-nowrap z-10"
                    >
                      <RotateCcw className="w-2.5 h-2.5" /> Restore
                    </button>
                  )}
                  {!isDeleted && isHovered && operation && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        restoreEditOperation(operation.id);
                      }}
                      className="absolute -top-5 left-1/2 -translate-x-1/2 flex items-center gap-0.5 px-1.5 py-0.5 bg-editor-surface border border-editor-border rounded text-[10px] text-editor-success whitespace-nowrap z-10"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      Restore {operation.kind === 'mute' ? 'mute' : operation.kind === 'caption-only' ? 'caption' : operation.kind === 'room-tone' ? 'room tone' : 'speaker'}
                    </button>
                  )}
                </span>
              );
            })}
          </p>
        </div>
      );
    },
    [visibleSegments, speakerFilter, deletedSet, selectedSet, operationMap, activeWordIndex, hoveredWordIndex, handleWordMouseDown, handleWordMouseEnter, setHoveredWordIndex, getRangeForWord, restoreRange, restoreEditOperation],
  );

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-editor-border shrink-0">
        <span className="text-xs text-editor-text-muted mr-auto">
          {visibleWordCount} words &middot; {deletedRanges.length} cuts &middot; {nonDeleteLayerCount} layers
        </span>
        {speakers.length > 0 && (
          <>
            <select
              value={speakerFilter}
              onChange={(e) => setSpeakerFilter(e.target.value)}
              className="px-2 py-1 bg-editor-surface border border-editor-border rounded text-xs text-editor-text focus:outline-none focus:border-editor-accent"
            >
              <option value="all">All speakers</option>
              {speakers.map((speaker) => (
                <option key={speaker} value={speaker}>
                  {speaker}
                </option>
              ))}
            </select>
            {speakerFilter !== 'all' && (
              <>
                <button
                  onClick={() => selectSpeakerWords(speakerFilter)}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-editor-accent/20 text-editor-accent rounded hover:bg-editor-accent/30 transition-colors"
                  title="Select speaker words"
                >
                  <UserRoundCheck className="w-3 h-3" />
                  Select
                </button>
                <button
                  onClick={handleRenameSpeaker}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-editor-border text-editor-text-muted rounded hover:bg-editor-surface transition-colors"
                  title="Rename speaker"
                >
                  <Pencil className="w-3 h-3" />
                  Rename
                </button>
                <button
                  onClick={handleDeleteSpeaker}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-editor-danger/20 text-editor-danger rounded hover:bg-editor-danger/30 transition-colors"
                  title="Delete speaker words"
                >
                  <Trash2 className="w-3 h-3" />
                  Delete
                </button>
              </>
            )}
          </>
        )}
        {selectedWordIndices.length > 0 && (
          <>
            <button
              onClick={hideSelectedWordsFromCaptions}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-editor-border text-editor-text-muted rounded hover:bg-editor-surface transition-colors"
            >
              <CaptionsOff className="w-3 h-3" />
              Hide captions
            </button>
            <button
              onClick={muteSelectedWords}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-editor-accent/20 text-editor-accent rounded hover:bg-editor-accent/30 transition-colors"
            >
              <VolumeX className="w-3 h-3" />
              Mute
            </button>
            <button
              onClick={replaceSelectedWordsWithRoomTone}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-editor-warning/10 text-editor-warning rounded hover:bg-editor-warning/20 transition-colors"
            >
              <Waves className="w-3 h-3" />
              Room tone
            </button>
            <button
              onClick={deleteSelectedWords}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-editor-danger/20 text-editor-danger rounded hover:bg-editor-danger/30 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Cut {selectedWordIndices.length}
            </button>
          </>
        )}
      </div>

      {selectionSummary && (
        <div className="border-b border-editor-border bg-editor-surface/80 px-4 py-2 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-editor-text-muted">
                <span className="font-medium text-editor-text">
                  {selectionSummary.indices.length} words selected
                </span>
                <span>{formatSelectionDuration(selectionSummary.duration)}</span>
                <span>
                  {formatTranscriptTime(selectionSummary.startTime)} - {formatTranscriptTime(selectionSummary.endTime)}
                </span>
              </div>
              <p className="mt-1 truncate text-xs text-editor-text" title={selectionSummary.text}>
                {selectionSummary.text}
              </p>
            </div>
            <button
              onClick={previewSelection}
              className="flex items-center gap-1 rounded bg-editor-accent/20 px-2 py-1 text-xs text-editor-accent hover:bg-editor-accent/30"
            >
              <Play className="w-3 h-3" />
              Preview
            </button>
            <button
              onClick={copySelectionText}
              className="flex items-center gap-1 rounded bg-editor-border px-2 py-1 text-xs text-editor-text-muted hover:bg-editor-bg"
            >
              <Copy className="w-3 h-3" />
              Copy text
            </button>
            <button
              onClick={draftClipFromSelection}
              className="flex items-center gap-1 rounded bg-editor-success/20 px-2 py-1 text-xs text-editor-success hover:bg-editor-success/30"
            >
              <Film className="w-3 h-3" />
              Draft clip
            </button>
            <button
              onClick={() => setSelectedWordIndices([])}
              className="flex items-center gap-1 rounded bg-editor-border px-2 py-1 text-xs text-editor-text-muted hover:bg-editor-bg"
            >
              <X className="w-3 h-3" />
              Clear
            </button>
          </div>
        </div>
      )}

      <div
        className="flex-1 min-h-0 select-none"
        onMouseUp={handleMouseUp}
        onMouseDown={pauseAutoScroll}
        onWheel={pauseAutoScroll}
        onTouchStart={pauseAutoScroll}
        onClick={handleClickOutside}
      >
        <Virtuoso
          ref={virtuosoRef}
          totalCount={visibleSegments.length}
          itemContent={renderSegment}
          overscan={200}
          className="h-full"
          style={{ height: '100%' }}
        />
      </div>
    </div>
  );
}

function formatTranscriptTime(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const mins = Math.floor(safeSeconds / 60);
  const secs = Math.floor(safeSeconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
