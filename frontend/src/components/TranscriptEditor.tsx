import { useCallback, useRef, useEffect, useMemo, useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import { Virtuoso } from 'react-virtuoso';
import type { VirtuosoHandle } from 'react-virtuoso';
import { CaptionsOff, Pencil, RotateCcw, Trash2, UserRoundCheck, VolumeX, Waves } from 'lucide-react';

export default function TranscriptEditor() {
  const words = useEditorStore((s) => s.words);
  const segments = useEditorStore((s) => s.segments);
  const deletedRanges = useEditorStore((s) => s.deletedRanges);
  const editOperations = useEditorStore((s) => s.editOperations);
  const selectedWordIndices = useEditorStore((s) => s.selectedWordIndices);
  const hoveredWordIndex = useEditorStore((s) => s.hoveredWordIndex);
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
  const getWordAtTime = useEditorStore((s) => s.getWordAtTime);
  const requestSeek = useEditorStore((s) => s.requestSeek);

  const selectionStart = useRef<number | null>(null);
  const wasDragging = useRef(false);
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const activeSegmentIndexRef = useRef(-1);
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

  const [activeWordIndex, setActiveWordIndex] = useState(-1);
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

  useEffect(() => {
    if (words.length === 0) {
      setActiveWordIndex(-1);
      return;
    }

    const updateActiveWord = (time: number) => {
      const idx = getWordAtTime(time);
      setActiveWordIndex((prev) => (prev === idx ? prev : idx));
    };

    updateActiveWord(useEditorStore.getState().currentTime);
    return useEditorStore.subscribe((state) => {
      updateActiveWord(state.currentTime);
    });
  }, [words.length, getWordAtTime]);

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
