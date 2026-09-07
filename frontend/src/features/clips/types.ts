export type ExportJob = {
  id: string;
  status: 'queued' | 'running' | 'canceling' | 'succeeded' | 'failed' | 'canceled';
  progress: number;
  message: string;
  logs?: Array<{ time: string; message: string }>;
  result?: {
    output_path?: string;
    srt_path?: string;
    file_capability?: string;
    srt_file_capability?: string;
    warnings?: string[];
  };
  error?: string;
};

export type BackgroundCapabilities = {
  available: boolean;
  mediapipe: boolean;
  opencv: boolean;
  rvm: boolean;
  replacements: string[];
};

export type ClipExportOutput = {
  outputPath: string;
  srtPath?: string;
  fileCapability?: string;
  srtFileCapability?: string;
  warnings: string[];
};
