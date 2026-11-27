import { useCallback, useRef, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { useEditorStore } from '../store/editorStore';
import { useAIStore } from '../store/aiStore';
import { Virtuoso } from 'react-virtuoso';
import type { VirtuosoHandle } from 'react-virtuoso';
import { CaptionsOff, ChevronLeft, ChevronRight, Copy, Film, Pencil, Play, RotateCcw, Search, Trash2, UserRoundCheck, VolumeX, Waves, X } from 'lucide-react';
import { adjustWordSelectionBoundary, formatSelectionDuration, moveTranscriptSelection, summarizeWordSelection, type TranscriptSelectionSummary } from '../utils/transcriptSelection';
import { findTranscriptMatches } from '../utils/transcriptSearch';
import { formatSpeakerDuration, getSpeakerStats } from '../utils/speakerStats';
import CreatorDialog from './CreatorDialog';
import CreatorNotice, { type CreatorNoticeData } from './CreatorNotice';
import { getCreatorErrorPresentation } from '../utils/creatorErrors';

export default function TranscriptEditor({ onDraftClip }: { onDraftClip: (selection: TranscriptSelectionSummary) => void }) {
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
  const addEditOperation = useEditorStore((s) => s.addEditOperation);
  const deleteSpeakerWords = useEditorStore((s) => s.deleteSpeakerWords);
  const renameSpeaker = useEditorStore((s) => s.renameSpeaker);
  const selectSpeakerWords = useEditorStore((s) => s.selectSpeakerWords);
  const restoreRange = useEditorStore((s) => s.restoreRange);
  const restoreEditOperation = useEditorStore((s) => s.restoreEditOperation);
  const requestSeek = useEditorStore((s) => s.requestSeek);
  const requestPreviewRange = useEditorStore((s) => s.requestPreviewRange);
  const clearClipPresentationPreview = useEditorStore((s) => s.clearClipPresentationPreview);
  const clipExportRunning = useAIStore((s) => s.clipDrafts.some((draft) => draft.status === 'exporting'));

  const selectionStart = useRef<number | null>(null);
  const wasDragging = useRef(false);
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const activeSegmentIndexRef = useRef(-1);
  const selectedSegmentIndexRef = useRef(-1);
  const userScrollPauseUntilRef = useRef(0);
  const userScrollTimerRef = useRef(0);
  const cutReviewButtonRef = useRef<HTMLButtonElement>(null);
  const keyboardSelection = useRef<ReturnType<typeof moveTranscriptSelection>>(null);
  const renameSpeakerButtonRef = useRef<HTMLButtonElement>(null);
  const deleteSpeakerButtonRef = useRef<HTMLButtonElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [cutReviewOpen, setCutReviewOpen] = useState(false);
  const [keyboardFeedback, setKeyboardFeedback] = useState('');
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [speakerNameDraft, setSpeakerNameDraft] = useState('');
  const [creatorNotice, setCreatorNotice] = useState<CreatorNoticeData | null>(null);

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
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);

  const speakers = useMemo(
    () =>
      Array.from(new Set(words.map((word) => word.speaker).filter(Boolean) as string[])).sort(),
    [words],
  );
  const speakerStats = useMemo(() => getSpeakerStats(words), [words]);
  const selectedSpeakerStat = useMemo(
    () => speakerStats.find((stat) => stat.speaker === speakerFilter) || null,
    [speakerFilter, speakerStats],
  );

  const visibleSegments = useMemo(() => {
    if (speakerFilter === 'all') return segments.map((segment, index) => ({ segment, index }));
    return segments
      .map((segment, index) => ({ segment, index }))
      .filter(({ segment }) => segment.speaker === speakerFilter || segment.words.some((word) => word.speaker === speakerFilter));
  }, [segments, speakerFilter]);

  const visibleWordIndices = useMemo(() => words.flatMap((word, index) =>
    speakerFilter === 'all' || word.speaker === speakerFilter ? [index] : [],
  ), [speakerFilter, words]);
  const visibleWordCount = visibleWordIndices.length;
  const nonDeleteLayerCount = useMemo(
    () => editOperations.filter((operation) => operation.kind !== 'delete').length,
    [editOperations],
  );
  const selectionSummary = useMemo(
    () => summarizeWordSelection(selectedWordIndices, words),
    [selectedWordIndices, words],
  );
  const selectionOperations = useMemo(() => {
    if (!selectionSummary) return [];
    const selected = new Set(selectionSummary.indices);
    return editOperations.filter((operation) => operation.wordIndices.some((index) => selected.has(index)));
  }, [editOperations, selectionSummary]);
  const searchMatches = useMemo(
    () => findTranscriptMatches(words, searchQuery),
    [searchQuery, words],
  );
  const searchMatchWordMap = useMemo(() => {
    const map = new Map<number, number>();
    searchMatches.forEach((match, matchIndex) => {
      for (let index = match.startIndex; index <= match.endIndex; index++) {
        map.set(index, matchIndex);
      }
    });
    return map;
  }, [searchMatches]);

  useEffect(() => {
    setActiveSearchIndex(0);
  }, [searchQuery]);

  const activateSearchResult = useCallback(
    (resultIndex: number) => {
      if (searchMatches.length === 0) return;
      const nextIndex = ((resultIndex % searchMatches.length) + searchMatches.length) % searchMatches.length;
      const match = searchMatches[nextIndex];
      setActiveSearchIndex(nextIndex);
      const indices = Array.from({ length: match.endIndex - match.startIndex + 1 }, (_, offset) => match.startIndex + offset);
      setSelectedWordIndices(indices);
      requestSeek(words[match.startIndex]?.start ?? 0, 'forward', false);
    },
    [requestSeek, searchMatches, setSelectedWordIndices, words],
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

  const handleTranscriptKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Escape' && selectedWordIndices.length > 0) {
      event.preventDefault();
      setSelectedWordIndices([]);
      setKeyboardFeedback('Selection cleared');
      return;
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const prior = keyboardSelection.current?.indices === selectedWordIndices ? keyboardSelection.current : null;
    const cursor = prior?.cursor ?? selectedWordIndices[0] ?? activeWordIndex;
    const next = moveTranscriptSelection(
      visibleWordIndices, cursor, prior?.anchor ?? cursor,
      event.key === 'ArrowLeft' ? -1 : 1, event.shiftKey,
    );
    if (!next) return;
    keyboardSelection.current = next;
    pauseAutoScroll();
    setSelectedWordIndices(next.indices);
    setKeyboardFeedback(next.indices.length === 1
      ? 'Selected ' + words[next.cursor].word
      : next.indices.length + ' words selected, ending at ' + words[next.cursor].word);
    requestSeek(words[next.cursor].start, 'forward', false);
    const segmentIndex = visibleSegments.findIndex(({ segment }) =>
      next.cursor >= segment.globalStartIndex && next.cursor < segment.globalStartIndex + segment.words.length,
    );
    if (segmentIndex >= 0) virtuosoRef.current?.scrollIntoView({ index: segmentIndex });
  };

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
    setSpeakerNameDraft(speakerFilter);
    setRenameDialogOpen(true);
  }, [speakerFilter]);

  const submitRenameSpeaker = useCallback(() => {
    const nextLabel = speakerNameDraft.trim();
    if (!nextLabel || speakerFilter === 'all') return;
    renameSpeaker(speakerFilter, nextLabel);
    setSpeakerFilter(nextLabel);
    setRenameDialogOpen(false);
  }, [renameSpeaker, speakerFilter, speakerNameDraft]);

  const handleDeleteSpeaker = useCallback(() => {
    if (speakerFilter === 'all') return;
    setDeleteDialogOpen(true);
  }, [speakerFilter]);

  const confirmDeleteSpeaker = useCallback(() => {
    if (speakerFilter === 'all') return;
    deleteSpeakerWords(speakerFilter);
    setDeleteDialogOpen(false);
  }, [deleteSpeakerWords, speakerFilter]);

  const applySpeakerLayer = useCallback(
    (kind: 'mute' | 'room-tone' | 'caption-only') => {
      if (!selectedSpeakerStat) return;
      addEditOperation(kind, selectedSpeakerStat.wordIndices);
    },
    [addEditOperation, selectedSpeakerStat],
  );

  const previewSelection = useCallback(() => {
    if (!selectionSummary) return;
    requestPreviewRange(selectionSummary.startTime, selectionSummary.endTime);
  }, [requestPreviewRange, selectionSummary]);

  const trimSelection = useCallback(
    (boundary: 'start' | 'end', direction: -1 | 1) => {
      const next = adjustWordSelectionBoundary(selectedWordIndices, words, boundary, direction);
      setSelectedWordIndices(next);
      if (next.length > 0 && boundary === 'start') {
        requestSeek(words[next[0]]?.start ?? 0, direction < 0 ? 'backward' : 'forward', false);
      }
    },
    [requestSeek, selectedWordIndices, setSelectedWordIndices, words],
  );

  const copySelectionText = useCallback(async () => {
    if (!selectionSummary) return;
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
        throw new Error('Clipboard access is unavailable');
      }
      await navigator.clipboard.writeText(selectionSummary.text);
      setCreatorNotice({
        tone: 'success',
        title: 'Copied',
        message: 'Selected transcript text copied to the clipboard.',
        onDismiss: () => setCreatorNotice(null),
      });
    } catch (err) {
      setCreatorNotice({ ...getCreatorErrorPresentation('clipboard', err), onDismiss: () => setCreatorNotice(null) });
    }
  }, [selectionSummary]);

  const draftClipFromSelection = useCallback(() => {
    if (!selectionSummary) return;
    onDraftClip(selectionSummary);
  }, [onDraftClip, selectionSummary]);

  const renderSegment = useCallback(
    (index: number) => {
      const segment = visibleSegments[index]?.segment;
      if (!segment) return null;
      return (
        <div className="workspace-transcript-segment">
          {segment.speaker && (
            <div className="workspace-speaker">
              {segment.speaker}
            </div>
          )}
          <p className="flex flex-wrap text-[15px] leading-[1.75]">
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
              const searchMatchIndex = searchMatchWordMap.get(globalIndex);
              const isSearchMatch = searchMatchIndex !== undefined;
              const isActiveSearchMatch = isSearchMatch && searchMatchIndex === activeSearchIndex;

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
                    ${isActiveSearchMatch && !isDeleted && !isSelected ? 'bg-editor-success/30 text-editor-success' : ''}
                    ${isSearchMatch && !isActiveSearchMatch && !isDeleted && !isSelected && !isActive ? 'bg-editor-warning/10 text-editor-warning' : ''}
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
    [visibleSegments, speakerFilter, deletedSet, selectedSet, operationMap, searchMatchWordMap, activeSearchIndex, activeWordIndex, hoveredWordIndex, handleWordMouseDown, handleWordMouseEnter, setHoveredWordIndex, getRangeForWord, restoreRange, restoreEditOperation],
  );

  return (
    <>
      {creatorNotice && <CreatorNotice notice={creatorNotice} className="mx-4 mt-2" />}
      <div className="flex-1 flex flex-col min-h-0">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-y border-editor-border px-3 py-2">
        <span className="mr-auto text-xs tabular-nums text-editor-text-muted">
          {visibleWordCount} words &middot; {nonDeleteLayerCount} layers
        </span>
        <button
          ref={cutReviewButtonRef}
          type="button"
          onClick={() => setCutReviewOpen(true)}
          className="rounded border border-editor-border bg-editor-surface px-2 py-1 text-xs text-editor-text-muted hover:text-editor-text"
        >
          Review cuts {deletedRanges.length > 0 && '(' + deletedRanges.length + ')'}
        </button>
        <div className="workspace-transcript-search">
          <Search className="h-3.5 w-3.5 text-editor-text-muted" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                activateSearchResult(event.shiftKey ? activeSearchIndex - 1 : activeSearchIndex);
              }
            }}
            placeholder="Search transcript"
            aria-label="Search transcript"
            className="min-w-0 flex-1 bg-transparent text-sm text-editor-text placeholder:text-editor-text-muted focus:outline-none"
          />
          {searchQuery && (
            <>
              <span className="text-[10px] text-editor-text-muted" aria-live="polite">
                {searchMatches.length === 0 ? '0 results' : `${activeSearchIndex + 1}/${searchMatches.length}`}
              </span>
              <button
                onClick={() => activateSearchResult(activeSearchIndex - 1)}
                disabled={searchMatches.length === 0}
                className="rounded p-0.5 text-editor-text-muted hover:bg-editor-bg disabled:opacity-40"
                title="Previous result"
                aria-label="Previous result"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => activateSearchResult(activeSearchIndex + 1)}
                disabled={searchMatches.length === 0}
                className="rounded p-0.5 text-editor-text-muted hover:bg-editor-bg disabled:opacity-40"
                title="Next result"
                aria-label="Next result"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setActiveSearchIndex(0);
                }}
                className="rounded p-0.5 text-editor-text-muted hover:bg-editor-bg"
                title="Clear search"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
        {speakers.length > 0 && (
          <>
            <select
              value={speakerFilter}
              onChange={(e) => setSpeakerFilter(e.target.value)}
              aria-label="Filter transcript by speaker"
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
                  ref={renameSpeakerButtonRef}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-editor-border text-editor-text-muted rounded hover:bg-editor-surface transition-colors"
                  title="Rename speaker"
                >
                  <Pencil className="w-3 h-3" />
                  Rename
                </button>
                <button
                  onClick={handleDeleteSpeaker}
                  ref={deleteSpeakerButtonRef}
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
      </div>

      {selectionSummary && (
        <div className="border-b border-editor-border bg-editor-surface/80 px-4 py-3 shrink-0">
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
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-editor-border/70 pt-2">
            <span className="text-[10px] font-medium uppercase text-editor-text-muted">Trim to words</span>
            <div className="flex items-center rounded border border-editor-border bg-editor-bg">
              <button
                onClick={() => trimSelection('start', -1)}
                className="p-1 text-editor-text-muted hover:bg-editor-surface hover:text-editor-text"
                title="Include previous word"
                aria-label="Include previous word"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="px-1 text-[10px] text-editor-text-muted">Start</span>
              <button
                onClick={() => trimSelection('start', 1)}
                className="p-1 text-editor-text-muted hover:bg-editor-surface hover:text-editor-text"
                title="Remove first selected word"
                aria-label="Remove first selected word"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex items-center rounded border border-editor-border bg-editor-bg">
              <button
                onClick={() => trimSelection('end', -1)}
                className="p-1 text-editor-text-muted hover:bg-editor-surface hover:text-editor-text"
                title="Remove last selected word"
                aria-label="Remove last selected word"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="px-1 text-[10px] text-editor-text-muted">End</span>
              <button
                onClick={() => trimSelection('end', 1)}
                className="p-1 text-editor-text-muted hover:bg-editor-surface hover:text-editor-text"
                title="Include next word"
                aria-label="Include next word"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <span className="ml-auto text-[10px] text-editor-text-muted">
              {words[selectionSummary.startIndex]?.word} - {words[selectionSummary.endIndex]?.word}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              onClick={hideSelectedWordsFromCaptions}
              className="flex items-center gap-1 rounded bg-editor-border px-2 py-1 text-[10px] text-editor-text-muted hover:bg-editor-bg"
            >
              <CaptionsOff className="h-3 w-3" /> Hide captions
            </button>
            <button
              onClick={muteSelectedWords}
              className="flex items-center gap-1 rounded bg-editor-accent/20 px-2 py-1 text-[10px] text-editor-accent hover:bg-editor-accent/30"
            >
              <VolumeX className="h-3 w-3" /> Mute
            </button>
            <button
              onClick={replaceSelectedWordsWithRoomTone}
              className="flex items-center gap-1 rounded bg-editor-warning/10 px-2 py-1 text-[10px] text-editor-warning hover:bg-editor-warning/20"
            >
              <Waves className="h-3 w-3" /> Room tone
            </button>
            <button
              onClick={deleteSelectedWords}
              className="flex items-center gap-1 rounded bg-editor-danger/20 px-2 py-1 text-[10px] text-editor-danger hover:bg-editor-danger/30"
            >
              <Trash2 className="h-3 w-3" /> Cut
            </button>
            {selectionOperations.map((operation) => (
              <button
                key={operation.id}
                onClick={() => restoreEditOperation(operation.id)}
                className="flex items-center gap-1 rounded bg-editor-success/15 px-2 py-1 text-[10px] text-editor-success hover:bg-editor-success/25"
                title={`Restore ${operation.kind} layer`}
              >
                <RotateCcw className="h-3 w-3" /> Restore {operation.kind}
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedSpeakerStat && (
        <div className="border-b border-editor-border bg-editor-bg px-4 py-2 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-auto min-w-0">
              <div className="text-xs font-medium text-editor-text">{selectedSpeakerStat.speaker}</div>
              <div className="text-[11px] text-editor-text-muted">
                {selectedSpeakerStat.wordCount} words &middot; {formatSpeakerDuration(selectedSpeakerStat.duration)} spoken &middot; {formatTranscriptTime(selectedSpeakerStat.startTime)} - {formatTranscriptTime(selectedSpeakerStat.endTime)}
              </div>
            </div>
            <button
              onClick={() => applySpeakerLayer('caption-only')}
              className="flex items-center gap-1 rounded bg-editor-border px-2 py-1 text-xs text-editor-text-muted hover:bg-editor-surface"
            >
              <CaptionsOff className="w-3 h-3" />
              Hide speaker captions
            </button>
            <button
              onClick={() => applySpeakerLayer('mute')}
              className="flex items-center gap-1 rounded bg-editor-accent/20 px-2 py-1 text-xs text-editor-accent hover:bg-editor-accent/30"
            >
              <VolumeX className="w-3 h-3" />
              Mute speaker
            </button>
            <button
              onClick={() => applySpeakerLayer('room-tone')}
              className="flex items-center gap-1 rounded bg-editor-warning/10 px-2 py-1 text-xs text-editor-warning hover:bg-editor-warning/20"
            >
              <Waves className="w-3 h-3" />
              Room tone speaker
            </button>
          </div>
        </div>
      )}

      <p id="transcript-keyboard-help" className="px-3 pt-2 text-xs text-editor-text-muted">
        Arrow keys select words. Hold Shift to extend.
      </p>
      <span role="status" className="sr-only">{keyboardFeedback}</span>
      <div
        className="min-h-0 flex-1 select-none pt-3 focus-visible:outline-offset-[-3px]"
        tabIndex={0}
        role="region"
        aria-label="Transcript words"
        aria-describedby="transcript-keyboard-help"
        onKeyDown={handleTranscriptKey}
        onMouseUp={handleMouseUp}
        onMouseDown={pauseAutoScroll}
        onWheel={pauseAutoScroll}
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

      <CreatorDialog
        open={cutReviewOpen}
        title="Review cuts"
        description="Preview the removed source audio or restore a cut to the edit."
        onClose={() => setCutReviewOpen(false)}
        returnFocusRef={cutReviewButtonRef}
      >
        {cutReviewOpen && (deletedRanges.length === 0 ? (
          <p className="mb-4 text-sm text-editor-text-muted">Select transcript words and choose Cut to see them here.</p>
        ) : (
          <ul className="mb-4 max-h-[55dvh] space-y-2 overflow-y-auto">
            {[...deletedRanges].sort((a, b) => a.start - b.start).map((range) => {
              const start = formatCutSourceTime(range.start);
              const end = formatCutSourceTime(range.end);
              const removed = range.wordIndices.map((index) => words[index]?.word).filter(Boolean).join(' ');
              return (
                <li key={range.id} className="rounded border border-editor-border bg-editor-bg p-3">
                  <p className="font-mono text-xs text-editor-text-muted">{start} to {end}</p>
                  {removed && <p className="mt-1 max-h-24 overflow-y-auto text-sm">{removed}</p>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCutReviewOpen(false);
                        clearClipPresentationPreview();
                        requestPreviewRange(range.start, range.end, true);
                      }}
                      aria-label={'Preview removed words at ' + start}
                      className="start-utility-button"
                    >
                      <Play className="h-4 w-4" aria-hidden="true" /> Preview source
                    </button>
                    <button
                      type="button"
                      disabled={clipExportRunning}
                      onClick={() => {
                        restoreRange(range.id);
                        setCutReviewOpen(false);
                      }}
                      aria-label={'Restore cut at ' + start}
                      className="start-utility-button"
                    >
                      <RotateCcw className="h-4 w-4" aria-hidden="true" /> Restore cut
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ))}
        <button
          type="button"
          onClick={() => setCutReviewOpen(false)}
          className="rounded border border-editor-border px-3 py-2 text-xs text-editor-text-muted hover:text-editor-text"
        >
          Close
        </button>
      </CreatorDialog>

      <CreatorDialog
        open={renameDialogOpen}
        title="Rename speaker"
        description="Choose the speaker name shown throughout this transcript."
        onClose={() => setRenameDialogOpen(false)}
        initialFocusRef={renameInputRef}
        returnFocusRef={renameSpeakerButtonRef}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submitRenameSpeaker();
          }}
        >
          <label htmlFor="rename-speaker-input" className="text-xs font-medium text-editor-text">Speaker name</label>
          <input
            id="rename-speaker-input"
            ref={renameInputRef}
            value={speakerNameDraft}
            onChange={(event) => setSpeakerNameDraft(event.target.value)}
            className="mt-2 w-full rounded border border-editor-border bg-editor-surface px-2.5 py-2 text-sm text-editor-text focus:border-editor-accent focus:outline-none"
          />
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setRenameDialogOpen(false)} className="rounded border border-editor-border px-3 py-2 text-xs text-editor-text-muted hover:bg-editor-surface">Cancel</button>
            <button type="submit" disabled={!speakerNameDraft.trim()} className="rounded bg-editor-accent px-3 py-2 text-xs font-medium text-white hover:bg-editor-accent-hover disabled:opacity-50">Rename</button>
          </div>
        </form>
      </CreatorDialog>

      <CreatorDialog
        open={deleteDialogOpen}
        title="Delete this speaker’s words?"
        description={`This will mark all words from ${speakerFilter} for deletion. You can undo the change afterward.`}
        onClose={() => setDeleteDialogOpen(false)}
        returnFocusRef={deleteSpeakerButtonRef}
      >
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setDeleteDialogOpen(false)} className="rounded border border-editor-border px-3 py-2 text-xs text-editor-text-muted hover:bg-editor-surface">Cancel</button>
          <button type="button" onClick={confirmDeleteSpeaker} className="rounded bg-editor-danger px-3 py-2 text-xs font-medium text-white hover:opacity-90">Delete words</button>
        </div>
      </CreatorDialog>
    </>
  );
}

function formatTranscriptTime(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const mins = Math.floor(safeSeconds / 60);
  const secs = Math.floor(safeSeconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatCutSourceTime(seconds: number) {
  const tenths = Math.floor(Math.max(0, seconds) * 10);
  return Math.floor(tenths / 600) + ':' +
    Math.floor(tenths / 10 % 60).toString().padStart(2, '0') + '.' + tenths % 10;
}
