export interface Word {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: string;
}

export interface Segment {
  id: number;
  start: number;
  end: number;
  text: string;
  words: Word[];
  speaker?: string;
  globalStartIndex: number;
}

export interface TimeRange {
  start: number;
  end: number;
}

export interface DeletedRange extends TimeRange {
  id: string;
  wordIndices: number[];
}

export type EditOperationKind = 'delete' | 'mute' | 'caption-only' | 'speaker-label' | 'room-tone';

export interface EditOperation extends TimeRange {
  id: string;
  kind: EditOperationKind;
  wordIndices: number[];
  speakerLabel?: string;
  originalSpeaker?: string;
}

export interface ProjectFile {
  app?: 'ScriptCut' | string;
  version: 1;
  videoPath: string;
  words: Word[];
  segments: Segment[];
  deletedRanges: DeletedRange[];
  editOperations?: EditOperation[];
  exportOptions?: ProjectExportOptions;
  aiWorkspace?: ProjectAIWorkspace;
  language: string;
  createdAt: string;
  modifiedAt: string;
}

export interface ProjectAIWorkspace {
  customFillerWords?: string;
  fillerResult?: FillerWordResult | null;
  fillerDecisions?: Record<number, FillerReviewDecision>;
  clipSuggestions?: ClipSuggestion[];
  clipDrafts?: ClipDraft[];
}

export interface TranscriptionResult {
  words: Word[];
  segments: Segment[];
  language: string;
}

export interface ExportOptions {
  outputPath: string;
  preset: 'source' | 'youtube-shorts' | 'tiktok-reels' | 'podcast-square';
  mode: 'fast' | 'reencode';
  resolution: '720p' | '1080p' | '4k';
  aspectRatio: 'source' | 'vertical' | 'square';
  reframe?: ReframeOptions;
  format: 'mp4' | 'mov' | 'webm';
  enhanceAudio: boolean;
  captions: 'none' | 'burn-in' | 'sidecar';
  captionStyle?: CaptionStyle;
  backgroundRemoval?: BackgroundRemovalOptions;
}

export type ProjectExportOptions = Omit<ExportOptions, 'outputPath'>;

export interface BackgroundRemovalOptions {
  enabled: boolean;
  replacement: 'blur' | 'color' | 'image';
  color: string;
  imagePath?: string;
}

export interface ReframeOptions {
  x: number;
  y: number;
}

export interface CaptionStyle {
  fontName: string;
  fontSize: number;
  fontColor: string;
  backgroundColor: string;
  position: 'bottom' | 'top' | 'center';
  bold: boolean;
  preset?: 'clean' | 'creator' | 'karaoke';
  highlightColor?: string;
  wordsPerLine?: number;
}

export type AIProvider = 'ollama' | 'openai' | 'claude' | '9router';

export interface AIProviderConfig {
  provider: AIProvider;
  apiKey?: string;
  baseUrl?: string;
  model: string;
}

export interface FillerWordResult {
  wordIndices: number[];
  fillerWords: Array<{ index: number; word: string; reason: string; confidence?: number }>;
}

export type FillerReviewDecision = 'accepted' | 'rejected';

export interface ClipSuggestion {
  title: string;
  startWordIndex: number;
  endWordIndex: number;
  startTime: number;
  endTime: number;
  reason: string;
}

export interface ClipDraft extends ClipSuggestion {
  id: string;
  format: ExportOptions['format'];
  resolution: ExportOptions['resolution'];
  aspectRatio: ExportOptions['aspectRatio'];
  reframe?: ReframeOptions;
  enhanceAudio?: boolean;
  captions?: ExportOptions['captions'];
  captionStyle?: CaptionStyle;
  backgroundRemoval?: BackgroundRemovalOptions;
  hook?: string;
  description?: string;
  caption?: string;
  hashtags?: string[];
  source?: 'ai' | 'speaker-turn';
  speaker?: string;
}
