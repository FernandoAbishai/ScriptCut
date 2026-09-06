import type { DeletedRange, EditOperation, ProjectExportOptions, Segment, Word } from '../types/project';

export interface EditorHistoryState {
  words: Word[];
  segments: Segment[];
  deletedRanges: DeletedRange[];
  editOperations: EditOperation[];
  exportOptions: ProjectExportOptions;
}

export function partializeEditorHistory(state: EditorHistoryState): EditorHistoryState {
  return {
    words: state.words,
    segments: state.segments,
    deletedRanges: state.deletedRanges,
    editOperations: state.editOperations,
    exportOptions: state.exportOptions,
  };
}

export function editorHistoryEqual(a: EditorHistoryState, b: EditorHistoryState): boolean {
  return (
    a.words === b.words &&
    a.segments === b.segments &&
    a.deletedRanges === b.deletedRanges &&
    a.editOperations === b.editOperations &&
    a.exportOptions === b.exportOptions
  );
}
