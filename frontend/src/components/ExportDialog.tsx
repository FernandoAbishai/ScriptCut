import { useEffect, useState, useCallback } from 'react';
import { useEditorStore } from '../store/editorStore';
import { Download, Loader2, Zap, Cog, Info, Monitor, Smartphone, Square, X, Image, FolderOpen, ExternalLink, RotateCcw } from 'lucide-react';
import type { CaptionStyle, ExportOptions, ProjectExportOptions } from '../types/project';
import CaptionPreview from './CaptionPreview';

type ExportPreset = ExportOptions['preset'];
type CaptionPreset = NonNullable<CaptionStyle['preset']>;

interface ExportResult {
  outputPath: string;
  srtPath?: string;
  warnings: string[];
  downloadUrl?: string;
  srtDownloadUrl?: string;
}

interface ExportJob {
  id: string;
  status: 'queued' | 'running' | 'canceling' | 'succeeded' | 'failed' | 'canceled';
  progress: number;
  message: string;
  logs?: Array<{ time: string; message: string }>;
  result?: {
    output_path?: string;
    srt_path?: string;
    warnings?: string[];
  };
  error?: string;
}

interface ExportHistoryItem {
  outputPath: string;
  srtPath?: string;
  exportedAt: string;
  preset: ExportPreset;
  format: ExportOptions['format'];
}

interface BackgroundCapabilities {
  available: boolean;
  mediapipe: boolean;
  opencv: boolean;
  rvm: boolean;
  replacements: string[];
}

const CAPTION_PRESETS: Record<CaptionPreset, CaptionStyle> = {
  clean: {
    preset: 'clean',
    fontName: 'Arial',
    fontSize: 48,
    fontColor: '#ffffff',
    backgroundColor: '#000000',
    position: 'bottom',
    bold: true,
    wordsPerLine: 8,
  },
  creator: {
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
  karaoke: {
    preset: 'karaoke',
    fontName: 'Arial',
    fontSize: 64,
    fontColor: '#facc15',
    backgroundColor: '#000000',
    position: 'center',
    bold: true,
    highlightColor: '#22c55e',
    wordsPerLine: 3,
  },
};

const EXPORT_DIRECTORY_KEY = 'scriptcut.export.directory';
const EXPORT_HISTORY_KEY = 'scriptcut.export.history.v1';
type CreatorTemplateId = 'shorts-batch' | 'caption-review' | 'podcast-square';

const CREATOR_TEMPLATES: Array<{
  id: CreatorTemplateId;
  title: string;
  desc: string;
}> = [
  { id: 'shorts-batch', title: 'Shorts Batch', desc: '9:16 MP4, captions, 1080p' },
  { id: 'caption-review', title: 'Caption Review', desc: 'Source frame with SRT sidecar' },
  { id: 'podcast-square', title: 'Podcast Clip', desc: '1:1 MP4, creator captions' },
];

function getExportDownloadUrl(backendUrl: string, path?: string) {
  return path ? `${backendUrl}/file?path=${encodeURIComponent(path)}` : '';
}

function getDefaultExportPath(videoPath: string, format: ExportOptions['format']) {
  return videoPath.replace(/\.[^.\\/]+$/, `_edited.${format}`);
}

function getPathSeparator(path: string) {
  return path.includes('\\') ? '\\' : '/';
}

function getPathDirectory(path: string) {
  const separator = getPathSeparator(path);
  const index = path.lastIndexOf(separator);
  return index > 0 ? path.slice(0, index) : '';
}

function joinPath(directory: string, filename: string) {
  const separator = getPathSeparator(directory);
  const trimmed = directory.replace(/[\\/]+$/, '');
  return trimmed ? `${trimmed}${separator}${filename}` : filename;
}

function safeFileStem(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 56) || 'scriptcut_export';
}

function getDefaultExportFilename(videoPath: string, preset: ExportPreset, format: ExportOptions['format']) {
  const sourceName = getDownloadFilename(videoPath, 'scriptcut_export').replace(/\.[^.]+$/, '');
  const presetSuffix = preset === 'source' ? 'edited' : preset.replace(/-/g, '_');
  return `${safeFileStem(sourceName)}_${presetSuffix}.${format}`;
}

function getDownloadFilename(path: string, fallback: string) {
  const normalized = path.replace(/\\/g, '/');
  return normalized.split('/').filter(Boolean).pop() || fallback;
}

function loadExportHistory(): ExportHistoryItem[] {
  try {
    const raw = window.localStorage.getItem(EXPORT_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function getExportPresetLabel(preset: ExportPreset) {
  switch (preset) {
    case 'youtube-shorts':
      return 'YouTube Shorts';
    case 'tiktok-reels':
      return 'TikTok/Reels';
    case 'podcast-square':
      return 'Podcast square';
    default:
      return 'Source frame';
  }
}

function getExportReadiness(options: ProjectExportOptions, hasCuts: boolean, wordCount: number, isElectron: boolean) {
  const details = [
    getExportPresetLabel(options.preset),
    options.aspectRatio === 'vertical' ? '9:16 vertical' : options.aspectRatio === 'square' ? '1:1 square' : 'original frame',
    options.mode === 'fast' && !hasCuts ? 'fast stream copy' : 'frame-accurate encode',
    options.captions === 'burn-in' ? 'burned captions' : options.captions === 'sidecar' ? 'SRT sidecar' : 'no captions',
  ];

  if (options.enhanceAudio) details.push('audio enhancement');
  if (options.backgroundRemoval?.enabled) details.push('background removal');

  return {
    title: wordCount > 0 ? 'Ready to export' : 'Waiting for transcript',
    details,
    note: isElectron
      ? 'Desktop exports can save directly to a chosen folder and reveal files in Finder.'
      : 'Browser exports are saved by the backend first, then downloaded from this panel.',
  };
}

export default function ExportDialog() {
  const {
    videoPath,
    words,
    deletedRanges,
    isExporting,
    exportProgress,
    backendUrl,
    setExporting,
    getKeepSegments,
    getMutedRanges,
    getCaptionHiddenIndices,
    setPreviewAspectRatio,
    exportOptions: options,
    setExportOptions,
  } = useEditorStore();

  const hasCuts = deletedRanges.length > 0;
  const [exportError, setExportError] = useState('');
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [exportJobId, setExportJobId] = useState('');
  const [exportMessage, setExportMessage] = useState('');
  const [lastExportJobId, setLastExportJobId] = useState('');
  const [exportLogs, setExportLogs] = useState<Array<{ time: string; message: string }>>([]);
  const [backgroundCapabilities, setBackgroundCapabilities] = useState<BackgroundCapabilities | null>(null);
  const [exportDirectory, setExportDirectory] = useState(() => window.localStorage.getItem(EXPORT_DIRECTORY_KEY) || '');
  const [exportHistory, setExportHistory] = useState<ExportHistoryItem[]>(loadExportHistory);
  const readiness = getExportReadiness(options, hasCuts, words.length, !!window.electronAPI);

  useEffect(() => {
    let canceled = false;
    fetch(`${backendUrl}/background/capabilities`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!canceled) setBackgroundCapabilities(data);
      })
      .catch(() => {
        if (!canceled) setBackgroundCapabilities(null);
      });
    return () => {
      canceled = true;
    };
  }, [backendUrl]);

  const applyPreset = useCallback((preset: ExportPreset) => {
    setExportOptions((current) => {
      switch (preset) {
        case 'youtube-shorts':
        case 'tiktok-reels':
          setPreviewAspectRatio('vertical');
          return { ...current, preset, mode: 'reencode', resolution: '1080p', aspectRatio: 'vertical' };
        case 'podcast-square':
          setPreviewAspectRatio('square');
          return { ...current, preset, mode: 'reencode', resolution: '1080p', aspectRatio: 'square' };
        default:
          setPreviewAspectRatio('source');
          return { ...current, preset, aspectRatio: 'source' };
      }
    });
  }, [setExportOptions, setPreviewAspectRatio]);

  const applyCreatorTemplate = useCallback((templateId: CreatorTemplateId) => {
    setExportOptions((current) => {
      if (templateId === 'caption-review') {
        setPreviewAspectRatio('source');
        return {
          ...current,
          preset: 'source',
          mode: 'reencode',
          aspectRatio: 'source',
          resolution: '1080p',
          format: 'mp4',
          captions: 'sidecar',
          enhanceAudio: false,
          backgroundRemoval: { ...(current.backgroundRemoval || { enabled: false, replacement: 'blur', color: '#111827' }), enabled: false },
        };
      }

      if (templateId === 'podcast-square') {
        setPreviewAspectRatio('square');
        return {
          ...current,
          preset: 'podcast-square',
          mode: 'reencode',
          aspectRatio: 'square',
          resolution: '1080p',
          format: 'mp4',
          captions: 'burn-in',
          captionStyle: CAPTION_PRESETS.creator,
          enhanceAudio: false,
        };
      }

      setPreviewAspectRatio('vertical');
      return {
        ...current,
        preset: 'youtube-shorts',
        mode: 'reencode',
        aspectRatio: 'vertical',
        resolution: '1080p',
        format: 'mp4',
        captions: 'burn-in',
        captionStyle: CAPTION_PRESETS.creator,
        enhanceAudio: false,
        reframe: current.reframe || { x: 50, y: 50 },
      };
    });
  }, [setExportOptions, setPreviewAspectRatio]);

  const chooseExportDirectory = useCallback(async () => {
    const directory = await window.electronAPI?.openDirectory({
      title: 'Choose export folder',
      defaultPath: exportDirectory || (videoPath ? getPathDirectory(videoPath) : undefined),
    });
    if (!directory) return;
    setExportDirectory(directory);
    window.localStorage.setItem(EXPORT_DIRECTORY_KEY, directory);
  }, [exportDirectory, videoPath]);

  const rememberExport = useCallback((item: ExportHistoryItem) => {
    setExportHistory((current) => {
      const next = [
        item,
        ...current.filter((existing) => existing.outputPath !== item.outputPath),
      ].slice(0, 6);
      window.localStorage.setItem(EXPORT_HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const revealPath = useCallback(async (path: string) => {
    await window.electronAPI?.revealPath(path);
  }, []);

  const revealExportDirectory = useCallback(async () => {
    if (exportDirectory) {
      await revealPath(exportDirectory);
      return;
    }
    if (exportHistory[0]?.outputPath) {
      await revealPath(exportHistory[0].outputPath);
    }
  }, [exportDirectory, exportHistory, revealPath]);

  const clearExportHistory = useCallback(() => {
    setExportHistory([]);
    window.localStorage.removeItem(EXPORT_HISTORY_KEY);
  }, []);

  const pollExportJob = useCallback(
    async (jobId: string) => {
      for (;;) {
        await new Promise((resolve) => window.setTimeout(resolve, 700));
        const res = await fetch(`${backendUrl}/jobs/${jobId}`);
        if (!res.ok) throw new Error(`Could not read export job: ${res.statusText}`);

        const job = (await res.json()) as ExportJob;
        setExportMessage(job.message || job.status);
        setExportLogs(job.logs || []);
        setExporting(job.status === 'queued' || job.status === 'running' || job.status === 'canceling', job.progress);

        if (job.status === 'succeeded') {
          const outputPath = job.result?.output_path || '';
          const srtPath = job.result?.srt_path;
          setExportResult({
            outputPath,
            srtPath,
            warnings: job.result?.warnings || [],
            downloadUrl: getExportDownloadUrl(backendUrl, outputPath),
            srtDownloadUrl: getExportDownloadUrl(backendUrl, srtPath),
          });
          if (outputPath) {
            rememberExport({
              outputPath,
              srtPath,
              exportedAt: new Date().toISOString(),
              preset: options.preset,
              format: options.format,
            });
          }
          setExportJobId('');
          setLastExportJobId(jobId);
          setExporting(false, 100);
          return;
        }

        if (job.status === 'failed' || job.status === 'canceled') {
          setLastExportJobId(jobId);
          throw new Error(job.error || job.message || `Export ${job.status}`);
        }
      }
    },
    [backendUrl, options.format, options.preset, rememberExport, setExporting],
  );

  const handleExport = useCallback(async () => {
    if (!videoPath) return;

    const outputPath = window.electronAPI
      ? exportDirectory
        ? joinPath(exportDirectory, getDefaultExportFilename(videoPath, options.preset, options.format))
        : await window.electronAPI.saveFile({
          defaultPath: getDefaultExportPath(videoPath, options.format),
          filters: [
            { name: 'MP4', extensions: ['mp4'] },
            { name: 'MOV', extensions: ['mov'] },
            { name: 'WebM', extensions: ['webm'] },
          ],
        })
      : undefined;
    if (window.electronAPI && !outputPath) return;

    setExportError('');
    setExportResult(null);
    setExportLogs([]);
    setLastExportJobId('');
    setExporting(true, 1);
    setExportMessage('Starting export');

    try {
      const keepSegments = getKeepSegments();

      const deletedSet = new Set<number>();
      for (const range of deletedRanges) {
        for (const idx of range.wordIndices) deletedSet.add(idx);
      }
      for (const idx of getCaptionHiddenIndices()) deletedSet.add(idx);

      const res = await fetch(`${backendUrl}/jobs/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...options,
          input_path: videoPath,
          output_path: outputPath || undefined,
          keep_segments: keepSegments,
          muted_ranges: getMutedRanges(),
          words: options.captions !== 'none' ? words : undefined,
          deleted_indices: options.captions !== 'none' ? [...deletedSet] : undefined,
          captionStyle: options.captions === 'burn-in' ? options.captionStyle : undefined,
        }),
      });
      if (!res.ok) {
        let detail = res.statusText;
        try {
          const data = await res.json();
          detail = data.detail || JSON.stringify(data);
        } catch {
          // Keep the HTTP status text if the backend did not return JSON.
        }
        throw new Error(`Export start failed: ${detail}`);
      }
      const { job_id: jobId } = await res.json();
      setExportJobId(jobId);
      setLastExportJobId(jobId);
      await pollExportJob(jobId);
    } catch (err) {
      console.error('Export error:', err);
      setExportError(err instanceof Error ? err.message : String(err));
      setExporting(false, 0);
    }
  }, [videoPath, options, backendUrl, setExporting, getKeepSegments, getMutedRanges, getCaptionHiddenIndices, deletedRanges, words, pollExportJob, exportDirectory]);

  const cancelExport = useCallback(async () => {
    if (!exportJobId) return;
    await fetch(`${backendUrl}/jobs/${exportJobId}/cancel`, { method: 'POST' });
    setExportJobId('');
    setExportMessage('Cancel requested');
  }, [backendUrl, exportJobId]);

  const retryExport = useCallback(async () => {
    if (!lastExportJobId) return;
    setExportError('');
    setExportResult(null);
    setExporting(true, 1);
    setExportMessage('Retrying export');
    const res = await fetch(`${backendUrl}/jobs/${lastExportJobId}/retry`, { method: 'POST' });
    if (!res.ok) {
      setExporting(false, 0);
      setExportError(`Retry failed: ${res.statusText}`);
      return;
    }
    const { job_id: jobId } = await res.json();
    setExportJobId(jobId);
    setLastExportJobId(jobId);
    try {
      await pollExportJob(jobId);
    } catch (err) {
      console.error('Export retry error:', err);
      setExportError(err instanceof Error ? err.message : String(err));
      setExporting(false, 0);
    }
  }, [backendUrl, lastExportJobId, pollExportJob, setExporting]);

  return (
    <div className="p-4 space-y-5">
      <h3 className="text-sm font-semibold">Export Video</h3>

      <div className="space-y-2 rounded border border-editor-border bg-editor-surface p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-editor-text">{readiness.title}</span>
          <span className="rounded bg-editor-accent/10 px-2 py-0.5 text-[10px] text-editor-accent">
            {Math.max(0, words.length)} words
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          {readiness.details.map((detail) => (
            <span key={detail} className="rounded bg-editor-bg px-1.5 py-0.5 text-[10px] text-editor-text-muted">
              {detail}
            </span>
          ))}
        </div>
        <p className="text-[11px] leading-4 text-editor-text-muted">{readiness.note}</p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs text-editor-text-muted font-medium">Creator Template</legend>
        <div className="grid grid-cols-1 gap-2">
          {CREATOR_TEMPLATES.map((template) => (
            <button
              key={template.id}
              onClick={() => applyCreatorTemplate(template.id)}
              className="flex items-center justify-between gap-3 rounded border border-editor-border bg-editor-surface px-3 py-2 text-left hover:border-editor-accent/60"
            >
              <span className="min-w-0">
                <span className="block text-xs font-medium text-editor-text">{template.title}</span>
                <span className="block truncate text-[10px] text-editor-text-muted">{template.desc}</span>
              </span>
              <RotateCcw className="h-3.5 w-3.5 shrink-0 text-editor-text-muted" />
            </button>
          ))}
        </div>
      </fieldset>

      {/* Preset */}
      <fieldset className="space-y-2">
        <legend className="text-xs text-editor-text-muted font-medium">Preset</legend>
        <div className="grid grid-cols-2 gap-2">
          <ModeCard
            active={options.preset === 'source'}
            onClick={() => applyPreset('source')}
            icon={<Monitor className="w-4 h-4" />}
            title="Source"
            desc="Original frame"
          />
          <ModeCard
            active={options.preset === 'youtube-shorts'}
            onClick={() => applyPreset('youtube-shorts')}
            icon={<Smartphone className="w-4 h-4" />}
            title="Shorts"
            desc="9:16 vertical"
          />
          <ModeCard
            active={options.preset === 'tiktok-reels'}
            onClick={() => applyPreset('tiktok-reels')}
            icon={<Smartphone className="w-4 h-4" />}
            title="TikTok/Reels"
            desc="9:16 vertical"
          />
          <ModeCard
            active={options.preset === 'podcast-square'}
            onClick={() => applyPreset('podcast-square')}
            icon={<Square className="w-4 h-4" />}
            title="Podcast"
            desc="1:1 square"
          />
        </div>
      </fieldset>

      {/* Mode */}
      <fieldset className="space-y-2">
        <legend className="text-xs text-editor-text-muted font-medium">Export Mode</legend>
        <div className="grid grid-cols-2 gap-2">
          <ModeCard
            active={options.mode === 'fast'}
            onClick={() => {
              setPreviewAspectRatio('source');
              setExportOptions((o) => ({ ...o, mode: 'fast', preset: 'source', aspectRatio: 'source' }));
            }}
            icon={<Zap className="w-4 h-4" />}
            title="Fast"
            desc="Stream copy, seconds"
          />
          <ModeCard
            active={options.mode === 'reencode'}
            onClick={() => setExportOptions((o) => ({ ...o, mode: 'reencode' }))}
            icon={<Cog className="w-4 h-4" />}
            title="Re-encode"
            desc="Custom quality, slower"
          />
        </div>
      </fieldset>

      {/* Resolution (only for re-encode) */}
      {options.mode === 'reencode' && (
        <SelectField
          label="Resolution"
          value={options.resolution}
          onChange={(v) => setExportOptions((o) => ({ ...o, resolution: v as ExportOptions['resolution'] }))}
          options={[
            { value: '720p', label: '720p (HD)' },
            { value: '1080p', label: '1080p (Full HD)' },
            { value: '4k', label: '4K (Ultra HD)' },
          ]}
        />
      )}

      {options.aspectRatio !== 'source' && (
        <ReframeControls
          value={options.reframe}
          onChange={(reframe) => setExportOptions((o) => ({ ...o, reframe }))}
        />
      )}

      {/* Format */}
      <SelectField
        label="Format"
        value={options.format}
        onChange={(v) => setExportOptions((o) => ({ ...o, format: v as ExportOptions['format'] }))}
        options={[
          { value: 'mp4', label: 'MP4 (H.264)' },
          { value: 'mov', label: 'MOV (QuickTime)' },
          { value: 'webm', label: 'WebM (VP9)' },
        ]}
      />

      {window.electronAPI && (
        <fieldset className="space-y-2">
          <legend className="text-xs text-editor-text-muted font-medium">Destination</legend>
          <div className="space-y-2 rounded border border-editor-border bg-editor-surface p-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-[11px] text-editor-text">
                  {exportDirectory || 'Ask where to save each export'}
                </div>
                <div className="text-[10px] text-editor-text-muted">
                  {exportDirectory
                    ? getDefaultExportFilename(videoPath || 'scriptcut_export', options.preset, options.format)
                    : 'Uses native Save dialog'}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                {exportDirectory && (
                  <button
                    onClick={() => {
                      setExportDirectory('');
                      window.localStorage.removeItem(EXPORT_DIRECTORY_KEY);
                    }}
                    className="rounded bg-editor-border px-2 py-1 text-[10px] text-editor-text-muted hover:bg-editor-bg"
                  >
                    Reset
                  </button>
                )}
                {(exportDirectory || exportHistory.length > 0) && (
                  <button
                    onClick={revealExportDirectory}
                    className="rounded bg-editor-border px-2 py-1 text-[10px] text-editor-text-muted hover:bg-editor-bg"
                  >
                    Open
                  </button>
                )}
                <button
                  onClick={chooseExportDirectory}
                  className="flex items-center gap-1 rounded bg-editor-border px-2 py-1 text-[10px] text-editor-text-muted hover:bg-editor-bg"
                >
                  <FolderOpen className="h-3 w-3" />
                  Choose
                </button>
              </div>
            </div>
          </div>
        </fieldset>
      )}

      {/* Audio enhancement */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={options.enhanceAudio}
          onChange={(e) => setExportOptions((o) => ({ ...o, enhanceAudio: e.target.checked }))}
          className="w-4 h-4 rounded bg-editor-surface border-editor-border accent-editor-accent"
        />
        <span className="text-xs">Enhance audio (Studio Sound)</span>
      </label>

      <BackgroundRemovalControls
        value={options.backgroundRemoval}
        capabilities={backgroundCapabilities}
        onChange={(backgroundRemoval) => setExportOptions((o) => ({ ...o, backgroundRemoval }))}
      />

      {/* Captions */}
      <SelectField
        label="Captions"
        value={options.captions}
        onChange={(v) => setExportOptions((o) => ({ ...o, captions: v as ExportOptions['captions'] }))}
        options={[
          { value: 'none', label: 'No captions' },
          { value: 'burn-in', label: 'Burn-in (permanent)' },
          { value: 'sidecar', label: 'Sidecar SRT file' },
        ]}
      />

      {options.captions === 'burn-in' && options.captionStyle && (
        <CaptionStyleControls
          value={options.captionStyle}
          onChange={(captionStyle) => setExportOptions((o) => ({ ...o, captionStyle }))}
        />
      )}

      {/* Export button */}
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <button
          onClick={handleExport}
          disabled={isExporting || !videoPath}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-editor-accent hover:bg-editor-accent-hover disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors"
        >
          {isExporting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Exporting... {Math.round(exportProgress)}%
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              Export
            </>
          )}
        </button>
        {isExporting && exportJobId && (
          <button
            onClick={cancelExport}
            className="flex items-center justify-center px-3 py-3 bg-editor-border text-editor-text-muted hover:bg-editor-surface rounded-lg transition-colors"
            title="Cancel export"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {isExporting && (
        <div className="space-y-1">
          <div className="h-1.5 rounded-full bg-editor-border overflow-hidden">
            <div
              className="h-full rounded-full bg-editor-accent transition-all"
              style={{ width: `${Math.max(4, Math.min(100, exportProgress))}%` }}
            />
          </div>
          <p className="text-[10px] text-editor-text-muted text-center">
            {exportMessage || 'Exporting'}
          </p>
        </div>
      )}

      {exportError && (
        <div className="space-y-2 rounded bg-editor-danger/10 border border-editor-danger/30 p-2 text-[11px] text-editor-danger">
          <div>{exportError}</div>
          {lastExportJobId && (
            <button
              onClick={retryExport}
              className="rounded bg-editor-danger/20 px-2 py-1 text-[10px] text-editor-danger hover:bg-editor-danger/30"
            >
              Retry export
            </button>
          )}
        </div>
      )}

      {exportResult && (
        <div className="space-y-1 rounded bg-editor-success/10 border border-editor-success/30 p-2 text-[11px] text-editor-success">
          <div>Exported to {exportResult.outputPath}</div>
          {exportResult.srtPath && <div>Captions saved to {exportResult.srtPath}</div>}
          {window.electronAPI && (
            <button
              onClick={() => revealPath(exportResult.outputPath)}
              className="inline-flex items-center gap-1 rounded bg-editor-success/20 px-2 py-1 text-[10px] text-editor-success hover:bg-editor-success/30"
            >
              <ExternalLink className="h-3 w-3" />
              Reveal in Finder
            </button>
          )}
          {exportResult.downloadUrl && !window.electronAPI && (
            <a
              href={exportResult.downloadUrl}
              download={getDownloadFilename(exportResult.outputPath, `scriptcut_export.${options.format}`)}
              className="inline-flex rounded bg-editor-success/20 px-2 py-1 text-[10px] text-editor-success hover:bg-editor-success/30"
            >
              Download video
            </a>
          )}
          {exportResult.srtDownloadUrl && !window.electronAPI && (
            <a
              href={exportResult.srtDownloadUrl}
              download={getDownloadFilename(exportResult.srtPath || '', 'scriptcut_export.srt')}
              className="ml-2 inline-flex rounded bg-editor-success/20 px-2 py-1 text-[10px] text-editor-success hover:bg-editor-success/30"
            >
              Download captions
            </a>
          )}
          {exportResult.warnings.map((warning) => (
            <div key={warning} className="text-editor-warning">
              {warning}
            </div>
          ))}
        </div>
      )}

      {exportHistory.length > 0 && window.electronAPI && (
        <details className="rounded border border-editor-border bg-editor-surface p-2 text-[10px] text-editor-text-muted">
          <summary className="cursor-pointer text-editor-text">Export history</summary>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span>{exportHistory.length} recent export{exportHistory.length === 1 ? '' : 's'}</span>
            <button
              onClick={clearExportHistory}
              className="rounded bg-editor-border px-2 py-1 text-[10px] text-editor-text-muted hover:bg-editor-bg"
            >
              Clear
            </button>
          </div>
          <div className="mt-2 space-y-1">
            {exportHistory.map((item) => (
              <div key={`${item.outputPath}-${item.exportedAt}`} className="flex items-center justify-between gap-2 rounded bg-editor-bg px-2 py-1">
                <div className="min-w-0">
                  <div className="truncate text-editor-text">{getDownloadFilename(item.outputPath, 'Export')}</div>
                  <div>{new Date(item.exportedAt).toLocaleString()} · {item.preset} · {item.format.toUpperCase()}</div>
                </div>
                <button
                  onClick={() => revealPath(item.outputPath)}
                  className="shrink-0 rounded bg-editor-border px-2 py-1 text-[10px] text-editor-text-muted hover:bg-editor-surface"
                >
                  Reveal
                </button>
              </div>
            ))}
          </div>
        </details>
      )}

      {exportLogs.length > 0 && (
        <details className="rounded border border-editor-border bg-editor-surface p-2 text-[10px] text-editor-text-muted">
          <summary className="cursor-pointer text-editor-text">Job log</summary>
          <div className="mt-2 max-h-32 space-y-1 overflow-y-auto">
            {exportLogs.slice(-8).map((entry, index) => (
              <div key={`${entry.time}-${index}`} className="break-words">
                {new Date(entry.time).toLocaleTimeString()} - {entry.message}
              </div>
            ))}
          </div>
        </details>
      )}

      {options.mode === 'fast' && !hasCuts && (
        <p className="text-[10px] text-editor-text-muted text-center">
          Fast mode uses stream copy &mdash; no quality loss, exports in seconds.
        </p>
      )}
      {options.mode === 'fast' && hasCuts && (
        <div className="flex items-start gap-1.5 p-2 bg-editor-accent/10 rounded text-[10px] text-editor-accent">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            Word-level cuts require re-encoding for frame-accurate output. Export will
            automatically use re-encode mode. This takes longer but ensures your cuts are precise.
          </span>
        </div>
      )}
      {options.aspectRatio !== 'source' && (
        <div className="flex items-start gap-1.5 p-2 bg-editor-accent/10 rounded text-[10px] text-editor-accent">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            Social presets crop the source into the selected frame. Use reframe to keep off-center
            subjects inside the safe area.
          </span>
        </div>
      )}
      {options.backgroundRemoval?.enabled && !backgroundCapabilities?.available && (
        <div className="flex items-start gap-1.5 p-2 bg-editor-warning/10 rounded text-[10px] text-editor-warning">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            Background removal needs local MediaPipe and OpenCV installed in the backend environment.
          </span>
        </div>
      )}
    </div>
  );
}

function ReframeControls({
  value,
  onChange,
}: {
  value: ExportOptions['reframe'];
  onChange: (value: NonNullable<ExportOptions['reframe']>) => void;
}) {
  const current = value ?? { x: 50, y: 50 };
  const update = (patch: Partial<NonNullable<ExportOptions['reframe']>>) =>
    onChange({ ...current, ...patch });

  return (
    <fieldset className="space-y-2 rounded border border-editor-border bg-editor-surface/60 p-2">
      <legend className="px-1 text-xs font-medium text-editor-text-muted">Reframe</legend>
      <RangeField
        label="Horizontal"
        value={current.x}
        leftLabel="Left"
        rightLabel="Right"
        onChange={(x) => update({ x })}
      />
      <RangeField
        label="Vertical"
        value={current.y}
        leftLabel="Top"
        rightLabel="Bottom"
        onChange={(y) => update({ y })}
      />
      <button
        type="button"
        onClick={() => onChange({ x: 50, y: 50 })}
        className="rounded bg-editor-border px-2 py-1 text-[10px] text-editor-text-muted hover:bg-editor-bg"
      >
        Center crop
      </button>
    </fieldset>
  );
}

function RangeField({
  label,
  value,
  leftLabel,
  rightLabel,
  onChange,
}: {
  label: string;
  value: number;
  leftLabel: string;
  rightLabel: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-editor-text">{label}</span>
        <span className="font-mono text-editor-text-muted">{Math.round(value)}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-editor-accent"
      />
      <div className="flex justify-between text-[10px] text-editor-text-muted">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
    </label>
  );
}

function BackgroundRemovalControls({
  value,
  capabilities,
  onChange,
}: {
  value: ExportOptions['backgroundRemoval'];
  capabilities: BackgroundCapabilities | null;
  onChange: (value: NonNullable<ExportOptions['backgroundRemoval']>) => void;
}) {
  const current = value ?? { enabled: false, replacement: 'blur' as const, color: '#111827' };
  const update = (patch: Partial<NonNullable<ExportOptions['backgroundRemoval']>>) =>
    onChange({ ...current, ...patch });

  const chooseImage = async () => {
    const imagePath = await window.electronAPI?.openFile({
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
      ],
    });
    if (imagePath) update({ imagePath, replacement: 'image' });
  };

  return (
    <fieldset className="space-y-2">
      <label className="flex items-center justify-between gap-3 cursor-pointer">
        <span className="space-y-0.5">
          <span className="block text-xs font-medium">Remove background</span>
          <span className="block text-[10px] text-editor-text-muted">
            {capabilities?.available ? 'Local person segmentation at export' : 'Requires MediaPipe + OpenCV'}
          </span>
        </span>
        <input
          type="checkbox"
          checked={current.enabled}
          onChange={(e) => update({ enabled: e.target.checked })}
          className="w-4 h-4 rounded bg-editor-surface border-editor-border accent-editor-accent"
        />
      </label>

      {current.enabled && (
        <div className="space-y-2 rounded border border-editor-border bg-editor-surface p-2">
          <SelectField
            label="Replacement"
            value={current.replacement}
            onChange={(replacement) =>
              update({ replacement: replacement as NonNullable<ExportOptions['backgroundRemoval']>['replacement'] })
            }
            options={[
              { value: 'blur', label: 'Blur source' },
              { value: 'color', label: 'Solid color' },
              { value: 'image', label: 'Image' },
            ]}
          />

          {current.replacement === 'color' && (
            <ColorField
              label="Background"
              value={current.color}
              onChange={(color) => update({ color })}
            />
          )}

          {current.replacement === 'image' && (
            <button
              onClick={chooseImage}
              className="flex w-full items-center justify-center gap-2 rounded border border-editor-border bg-editor-bg px-3 py-2 text-xs text-editor-text-muted hover:text-editor-text"
            >
              <Image className="w-3.5 h-3.5" />
              {current.imagePath ? 'Change Image' : 'Choose Image'}
            </button>
          )}

          {current.imagePath && current.replacement === 'image' && (
            <div className="truncate text-[10px] text-editor-text-muted">{current.imagePath}</div>
          )}
        </div>
      )}
    </fieldset>
  );
}

function CaptionStyleControls({
  value,
  onChange,
}: {
  value: CaptionStyle;
  onChange: (style: CaptionStyle) => void;
}) {
  const update = (patch: Partial<CaptionStyle>) => onChange({ ...value, ...patch });

  return (
    <fieldset className="space-y-3">
      <legend className="text-xs text-editor-text-muted font-medium">Caption Style</legend>
      <div className="grid grid-cols-3 gap-2">
        {Object.entries(CAPTION_PRESETS).map(([key, preset]) => (
          <button
            key={key}
            onClick={() => onChange(preset)}
            className={`rounded border px-2 py-2 text-xs transition-colors ${
              value.preset === key
                ? 'border-editor-accent bg-editor-accent/10 text-editor-accent'
                : 'border-editor-border text-editor-text-muted hover:text-editor-text'
            }`}
          >
            {key === 'clean' ? 'Clean' : key === 'creator' ? 'Creator' : 'Karaoke'}
          </button>
        ))}
      </div>

      <CaptionPreview style={value} />

      <div className="grid grid-cols-2 gap-2">
        <SelectField
          label="Position"
          value={value.position}
          onChange={(position) => update({ position: position as CaptionStyle['position'], preset: undefined })}
          options={[
            { value: 'bottom', label: 'Bottom' },
            { value: 'center', label: 'Center' },
            { value: 'top', label: 'Top' },
          ]}
        />
        <SelectField
          label="Words"
          value={String(value.wordsPerLine ?? 8)}
          onChange={(wordsPerLine) => update({ wordsPerLine: Number(wordsPerLine), preset: undefined })}
          options={[
            { value: '3', label: '3 words' },
            { value: '5', label: '5 words' },
            { value: '8', label: '8 words' },
            { value: '12', label: '12 words' },
          ]}
        />
      </div>

      <label className="space-y-1 block">
        <span className="text-xs text-editor-text-muted font-medium">Font Size</span>
        <input
          type="range"
          min="32"
          max="84"
          value={value.fontSize}
          onChange={(e) => update({ fontSize: Number(e.target.value), preset: undefined })}
          className="w-full accent-editor-accent"
        />
        <span className="block text-[10px] text-editor-text-muted">{value.fontSize}px</span>
      </label>

      <div className="grid grid-cols-2 gap-2">
        <ColorField
          label="Text"
          value={value.fontColor}
          onChange={(fontColor) => update({ fontColor, preset: undefined })}
        />
        <ColorField
          label="Background"
          value={value.backgroundColor}
          onChange={(backgroundColor) => update({ backgroundColor, preset: undefined })}
        />
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={value.bold}
          onChange={(e) => update({ bold: e.target.checked, preset: undefined })}
          className="w-4 h-4 rounded bg-editor-surface border-editor-border accent-editor-accent"
        />
        <span className="text-xs">Bold captions</span>
      </label>
    </fieldset>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1 block">
      <span className="text-xs text-editor-text-muted font-medium">{label}</span>
      <span className="flex items-center gap-2 rounded border border-editor-border bg-editor-surface px-2 py-1.5">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-5 w-5 shrink-0 cursor-pointer border-0 bg-transparent p-0"
        />
        <span className="font-mono text-[10px] text-editor-text-muted uppercase">{value}</span>
      </span>
    </label>
  );
}

function ModeCard({
  active,
  onClick,
  icon,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-colors ${
        active
          ? 'border-editor-accent bg-editor-accent/10'
          : 'border-editor-border hover:border-editor-text-muted'
      }`}
    >
      {icon}
      <span className="text-xs font-medium">{title}</span>
      <span className="text-[10px] text-editor-text-muted">{desc}</span>
    </button>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-editor-text-muted font-medium">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-editor-surface border border-editor-border rounded-lg text-xs text-editor-text focus:outline-none focus:border-editor-accent"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
