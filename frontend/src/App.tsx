import { useEffect, useState, useRef } from 'react';
import { useEditorStore } from './store/editorStore';
import { useAIStore } from './store/aiStore';
import VideoPlayer from './components/VideoPlayer';
import TranscriptEditor from './components/TranscriptEditor';
import WaveformTimeline from './components/WaveformTimeline';
import AIPanel from './components/AIPanel';
import ExportDialog from './components/ExportDialog';
import SettingsPanel from './components/SettingsPanel';
import { saveProject, useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import {
  getAutosaveCandidatePaths,
  listAutosaveCandidates,
  parseProjectFile,
  removeAutosaveCandidate,
  useProjectAutosave,
  type AutosaveCandidate,
} from './hooks/useProjectAutosave';
import {
  Film,
  FolderOpen,
  Settings,
  Sparkles,
  Download,
  Loader2,
  FileInput,
  Save,
  AlertTriangle,
  Upload,
  FileVideo,
} from 'lucide-react';

const IS_ELECTRON = !!window.electronAPI;

type Panel = 'ai' | 'settings' | 'export' | null;
type TranscriptionEngine = 'auto' | 'whisperx' | 'whisper' | 'parakeet';
type TranscriptionEngineStatus = {
  default_engine?: TranscriptionEngine | null;
  default_model?: string;
  engines?: Record<string, {
    available: boolean;
    default_model?: string;
    label?: string;
    first_class?: boolean;
    languages?: number;
    install_hint?: string;
  }>;
};

const TRANSCRIPTION_MODELS: Record<TranscriptionEngine, Array<{ value: string; label: string }>> = {
  auto: [
    { value: 'nvidia/parakeet-tdt-0.6b-v3', label: 'Auto best available' },
    { value: 'base', label: 'base (~140 MB, Whisper fallback)' },
    { value: 'small', label: 'small (~460 MB, better)' },
    { value: 'medium', label: 'medium (~1.5 GB, high accuracy)' },
  ],
  whisperx: [
    { value: 'tiny', label: 'tiny (~75 MB, fastest)' },
    { value: 'base', label: 'base (~140 MB, fast)' },
    { value: 'small', label: 'small (~460 MB, good)' },
    { value: 'medium', label: 'medium (~1.5 GB, better)' },
    { value: 'large', label: 'large (~2.9 GB, best)' },
  ],
  whisper: [
    { value: 'tiny', label: 'tiny (~75 MB, fastest)' },
    { value: 'base', label: 'base (~140 MB, fast)' },
    { value: 'small', label: 'small (~460 MB, good)' },
    { value: 'medium', label: 'medium (~1.5 GB, better)' },
    { value: 'large', label: 'large (~2.9 GB, best)' },
  ],
  parakeet: [
    { value: 'nvidia/parakeet-tdt-0.6b-v3', label: 'Parakeet TDT v3 multilingual' },
  ],
};

interface BackendJob<T> {
  status: 'queued' | 'running' | 'canceling' | 'succeeded' | 'failed' | 'canceled';
  progress: number;
  message: string;
  logs?: Array<{ time: string; message: string }>;
  result?: T;
  error?: string;
}

export default function App() {
  const {
    videoPath,
    words,
    isTranscribing,
    transcriptionProgress,
    loadVideo,
    setBackendUrl,
    setTranscription,
    setTranscribing,
    backendUrl,
  } = useEditorStore();

  const [activePanel, setActivePanel] = useState<Panel>(null);
  const [transcriptionEngine, setTranscriptionEngine] = useState<TranscriptionEngine>('parakeet');
  const [transcriptionModel, setTranscriptionModel] = useState('nvidia/parakeet-tdt-0.6b-v3');
  const [transcriptionEngineStatus, setTranscriptionEngineStatus] = useState<TranscriptionEngineStatus | null>(null);
  const [transcriptionMessage, setTranscriptionMessage] = useState('');
  const [transcriptionError, setTranscriptionError] = useState('');
  const [transcriptionLogs, setTranscriptionLogs] = useState<Array<{ time: string; message: string }>>([]);
  const [lastTranscriptionJobId, setLastTranscriptionJobId] = useState('');
  const [browserUploadName, setBrowserUploadName] = useState('');
  const [browserUploadError, setBrowserUploadError] = useState('');
  const [isBrowserUploading, setIsBrowserUploading] = useState(false);
  const [manualSaveStatus, setManualSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [recoveryCandidate, setRecoveryCandidate] = useState<AutosaveCandidate | null>(null);
  const [recoveryError, setRecoveryError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useKeyboardShortcuts();
  const autosave = useProjectAutosave();

  useEffect(() => {
    if (IS_ELECTRON) {
      window.electronAPI!.getBackendUrl().then(setBackendUrl);
    }
  }, [setBackendUrl]);

  useEffect(() => {
    let canceled = false;
    fetch(`${backendUrl}/transcription/engines`)
      .then((res) => (res.ok ? res.json() : null))
      .then((status: TranscriptionEngineStatus | null) => {
        if (canceled || !status) return;
        setTranscriptionEngineStatus(status);
        if (status.default_engine && status.default_model) {
          setTranscriptionEngine(status.default_engine);
          setTranscriptionModel(status.default_model);
        }
      })
      .catch(() => {
        if (!canceled) setTranscriptionEngineStatus(null);
      });
    return () => {
      canceled = true;
    };
  }, [backendUrl]);

  useEffect(() => {
    if (!IS_ELECTRON || videoPath) return;
    const latest = listAutosaveCandidates()[0] || null;
    setRecoveryCandidate(latest);
    setRecoveryError('');
  }, [videoPath]);

  const handleLoadProject = async () => {
    if (!IS_ELECTRON) return;
    try {
      const projectPath = await window.electronAPI!.openProject();
      if (!projectPath) return;
      const content = await window.electronAPI!.readFile(projectPath);
      const data = parseProjectFile(content);
      loadProjectState(data);
    } catch (err) {
      console.error('Failed to load project:', err);
      alert(`Failed to load project: ${err}`);
    }
  };

  const recoverAutosave = async (candidate: AutosaveCandidate) => {
    if (!IS_ELECTRON) return;
    setRecoveryError('');
    try {
      const content = await window.electronAPI!.readFile(candidate.path);
      const data = parseProjectFile(content);
      loadProjectState(data);
    } catch (err) {
      console.error('Failed to recover autosave:', err);
      removeAutosaveCandidate(candidate.path);
      setRecoveryCandidate(listAutosaveCandidates()[0] || null);
      setRecoveryError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSaveProject = async () => {
    setManualSaveStatus('saving');
    try {
      const savedPath = await saveProject();
      setManualSaveStatus(savedPath ? 'saved' : 'idle');
      if (savedPath) {
        window.setTimeout(() => setManualSaveStatus('idle'), 1800);
      }
    } catch (err) {
      console.error('Failed to save project:', err);
      setManualSaveStatus('error');
      window.setTimeout(() => setManualSaveStatus('idle'), 3000);
    }
  };

  const handleOpenFile = async () => {
    if (IS_ELECTRON) {
      const path = await window.electronAPI!.openFile();
      if (path) {
        const restored = await tryRestoreAutosave(path);
        if (restored) return;

        loadVideo(path);
        await transcribeVideo(path);
      }
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleBrowserFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await uploadBrowserFile(file);
  };

  const handleBrowserDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await uploadBrowserFile(file);
  };

  const uploadBrowserFile = async (file: File) => {
    setBrowserUploadName(file.name);
    setBrowserUploadError('');
    setTranscriptionError('');
    setIsBrowserUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${backendUrl}/media/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        let detail = res.statusText;
        try {
          const errorData = await res.json();
          detail = errorData.detail || JSON.stringify(errorData);
        } catch {
          // Keep the HTTP status text when the backend response is not JSON.
        }
        throw new Error(`Upload failed: ${detail}`);
      }

      const data = (await res.json()) as { path: string; filename: string; size: number };
      loadVideo(data.path);
      await transcribeVideo(data.path);
    } catch (err) {
      console.error('Browser upload error:', err);
      setBrowserUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsBrowserUploading(false);
    }
  };

  const tryRestoreAutosave = async (path: string) => {
    if (!IS_ELECTRON) return false;

    for (const autosavePath of getAutosaveCandidatePaths(path)) {
      try {
        const content = await window.electronAPI!.readFile(autosavePath);
        const data = parseProjectFile(content);
        if (data.videoPath !== path || !Array.isArray(data.words)) continue;

        const shouldRestore = window.confirm(
          'An autosaved ScriptCut project exists for this media file. Restore it instead of starting a new transcription?',
        );
        if (!shouldRestore) return false;

        loadProjectState(data);
        return true;
      } catch {
        // Try the next autosave naming convention.
      }
    }

    return false;
  };

  const transcribeVideo = async (path: string) => {
    setTranscribing(true, 0);
    setTranscriptionMessage('Starting transcription');
    setTranscriptionError('');
    setTranscriptionLogs([]);
    setLastTranscriptionJobId('');
    try {
      const res = await fetch(`${backendUrl}/jobs/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: path, engine: transcriptionEngine, model: transcriptionModel }),
      });
      if (!res.ok) {
        let detail = res.statusText;
        try {
          const errorData = await res.json();
          detail = errorData.detail || JSON.stringify(errorData);
        } catch {
          // Keep the HTTP status text when the backend response is not JSON.
        }
        throw new Error(`Transcription start failed: ${detail}`);
      }
      const { job_id: jobId } = await res.json();
      setLastTranscriptionJobId(jobId);
      const data = await pollTranscriptionJob(jobId);
      setTranscription(data);
    } catch (err) {
      console.error('Transcription error:', err);
      const message = err instanceof Error ? err.message : String(err);
      setTranscriptionError(message.toLowerCase().includes('canceled') ? 'Transcription canceled' : message);
    } finally {
      setTranscriptionMessage('');
      setTranscribing(false);
    }
  };

  const cancelTranscription = async () => {
    if (!lastTranscriptionJobId) return;
    try {
      await fetch(`${backendUrl}/jobs/${lastTranscriptionJobId}/cancel`, { method: 'POST' });
      setTranscriptionMessage('Cancel requested');
    } catch (err) {
      console.error('Transcription cancel error:', err);
      setTranscriptionError(err instanceof Error ? err.message : String(err));
      setTranscribing(false);
    }
  };

  const retryTranscription = async () => {
    if (!lastTranscriptionJobId) return;
    setTranscriptionError('');
    setTranscriptionMessage('Retrying transcription');
    setTranscribing(true, 1);
    try {
      const res = await fetch(`${backendUrl}/jobs/${lastTranscriptionJobId}/retry`, { method: 'POST' });
      if (!res.ok) throw new Error(`Retry failed: ${res.statusText}`);
      const { job_id: jobId } = await res.json();
      setLastTranscriptionJobId(jobId);
      const data = await pollTranscriptionJob(jobId);
      setTranscription(data);
    } catch (err) {
      console.error('Transcription retry error:', err);
      setTranscriptionError(err instanceof Error ? err.message : String(err));
    } finally {
      setTranscriptionMessage('');
      setTranscribing(false);
    }
  };

  const pollTranscriptionJob = async (jobId: string) => {
    for (;;) {
      await new Promise((resolve) => window.setTimeout(resolve, 700));
      const res = await fetch(`${backendUrl}/jobs/${jobId}`);
      if (!res.ok) throw new Error(`Could not read transcription job: ${res.statusText}`);

      const job = (await res.json()) as BackendJob<Parameters<typeof setTranscription>[0]>;
      setTranscriptionMessage(job.message || job.status);
      setTranscriptionLogs(job.logs || []);
      setTranscribing(job.status === 'queued' || job.status === 'running' || job.status === 'canceling', job.progress);

      if (job.status === 'succeeded') {
        if (!job.result) throw new Error('Transcription job finished without a result');
        return job.result;
      }
      if (job.status === 'failed' || job.status === 'canceled') {
        throw new Error(job.error || job.message || `Transcription ${job.status}`);
      }
    }
  };

  const togglePanel = (panel: Panel) =>
    setActivePanel((prev) => (prev === panel ? null : panel));

  if (!videoPath) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-8 bg-editor-bg px-6">
        {!IS_ELECTRON && (
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp4,.avi,.mov,.mkv,.webm,.m4a,.mp3,.wav,.flac,video/*,audio/*"
            className="hidden"
            onChange={handleBrowserFileChange}
          />
        )}
        <div className="flex flex-col items-center gap-3">
          <Film className="w-14 h-14 text-editor-accent opacity-80" />
          <h1 className="text-3xl font-semibold tracking-tight">ScriptCut</h1>
          <p className="text-editor-text-muted text-sm max-w-sm text-center">
            Open-source text-based video editing powered by AI.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <label className="text-xs text-editor-text-muted whitespace-nowrap">Transcription engine:</label>
          <select
            value={transcriptionEngine}
            onChange={(e) => {
              const engine = e.target.value as TranscriptionEngine;
              setTranscriptionEngine(engine);
              setTranscriptionModel(TRANSCRIPTION_MODELS[engine][0].value);
            }}
            className="px-3 py-1.5 bg-editor-surface border border-editor-border rounded-lg text-xs text-editor-text focus:outline-none focus:border-editor-accent"
          >
            <option value="auto">Auto best available</option>
            <option value="parakeet">Parakeet TDT v3 multilingual</option>
            <option value="whisperx">WhisperX aligned</option>
            <option value="whisper">Whisper fallback</option>
          </select>
          <select
            value={transcriptionModel}
            onChange={(e) => setTranscriptionModel(e.target.value)}
            className="px-3 py-1.5 bg-editor-surface border border-editor-border rounded-lg text-xs text-editor-text focus:outline-none focus:border-editor-accent"
          >
            {TRANSCRIPTION_MODELS[transcriptionEngine].map((model) => (
              <option key={model.value} value={model.value}>
                {model.label}
              </option>
            ))}
          </select>
        </div>
        <div className="max-w-xl rounded border border-editor-border bg-editor-surface px-3 py-2 text-center text-[11px] text-editor-text-muted">
          {transcriptionEngine === 'parakeet' ? (
            transcriptionEngineStatus?.engines?.parakeet?.available ? (
              <span>Parakeet TDT v3 ready - fast multilingual transcription with word timestamps.</span>
            ) : (
              <span>
                Parakeet TDT v3 selected. Install locally with{' '}
                <code className="rounded bg-editor-bg px-1">pip install -U nemo_toolkit['asr']</code>, or choose Auto/Whisper.
              </span>
            )
          ) : transcriptionEngine === 'auto' ? (
            <span>
              Auto uses Parakeet when available, then falls back to WhisperX or Whisper.
            </span>
          ) : (
            <span>{TRANSCRIPTION_MODELS[transcriptionEngine][0]?.label || 'Transcription engine selected'}.</span>
          )}
        </div>

        {IS_ELECTRON ? (
          <div className="flex flex-col items-center gap-3">
            {recoveryCandidate && (
              <div className="w-full max-w-md rounded-lg border border-editor-warning/30 bg-editor-warning/10 p-3 text-left">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-editor-warning" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-editor-text">Recover autosaved project</div>
                    <div className="mt-1 truncate text-[11px] text-editor-text-muted">
                      {recoveryCandidate.videoPath.split(/[\\/]/).pop()} · {new Date(recoveryCandidate.modifiedAt).toLocaleString()}
                    </div>
                    {recoveryError && (
                      <div className="mt-1 text-[11px] text-editor-warning">{recoveryError}</div>
                    )}
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => recoverAutosave(recoveryCandidate)}
                        className="rounded bg-editor-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-editor-accent-hover"
                      >
                        Recover
                      </button>
                      <button
                        onClick={() => setRecoveryCandidate(null)}
                        className="rounded bg-editor-surface px-3 py-1.5 text-xs text-editor-text-muted hover:text-editor-text"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <button
              onClick={handleOpenFile}
              className="flex items-center gap-2 px-6 py-3 bg-editor-accent hover:bg-editor-accent-hover rounded-lg text-white font-medium transition-colors"
            >
              <FolderOpen className="w-5 h-5" />
              Open Video File
            </button>
            <button
              onClick={handleLoadProject}
              className="flex items-center gap-2 px-4 py-2 text-sm text-editor-text-muted hover:text-editor-text hover:bg-editor-surface rounded-lg transition-colors"
            >
              <FileInput className="w-4 h-4" />
              Load Project
            </button>
          </div>
        ) : (
          <div className="w-full max-w-xl space-y-4">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleBrowserDrop}
              className="group flex min-h-48 flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-editor-border bg-editor-surface/45 px-6 py-8 text-center transition-colors hover:border-editor-accent/60 hover:bg-editor-surface/70"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-editor-accent/15 text-editor-accent">
                {isBrowserUploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <FileVideo className="h-6 w-6" />}
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium text-editor-text">
                  {isBrowserUploading ? 'Uploading media...' : 'Choose a video or audio file'}
                </div>
                <p className="mx-auto max-w-sm text-xs leading-5 text-editor-text-muted">
                  Pick a file from your folders or drop it here. ScriptCut uploads it to the local backend before transcription.
                </p>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isBrowserUploading}
                className="flex items-center gap-2 rounded bg-editor-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-editor-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isBrowserUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Browse files
              </button>
              {browserUploadName && (
                <div className="max-w-full truncate text-[11px] text-editor-text-muted">
                  {isBrowserUploading ? 'Uploading' : 'Last selected'}: {browserUploadName}
                </div>
              )}
            </div>
            {browserUploadError && (
              <div className="rounded border border-editor-danger/30 bg-editor-danger/10 px-3 py-2 text-xs text-editor-danger">
                {browserUploadError}
              </div>
            )}
            <p className="text-[11px] text-editor-text-muted text-center">
              Supported: MP4, AVI, MOV, MKV, WebM, M4A, MP3, WAV, FLAC
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-editor-bg overflow-hidden">
      {!IS_ELECTRON && (
        <input
          ref={fileInputRef}
          type="file"
          accept=".mp4,.avi,.mov,.mkv,.webm,.m4a,.mp3,.wav,.flac,video/*,audio/*"
          className="hidden"
          onChange={handleBrowserFileChange}
        />
      )}
      {/* Top bar */}
      <header className="h-12 flex items-center justify-between px-4 border-b border-editor-border shrink-0">
        <div className="flex items-center gap-3">
          <Film className="w-5 h-5 text-editor-accent" />
          <div className="min-w-0">
            <span className="block max-w-[300px] truncate text-sm font-medium">
              {videoPath.split(/[\\/]/).pop()}
            </span>
            <AutosaveStatus autosave={autosave} />
          </div>
        </div>
        <div className="flex items-center gap-1">
          <ToolbarButton
            icon={<FolderOpen className="w-4 h-4" />}
            label="Open"
            onClick={handleOpenFile}
            disabled={isBrowserUploading}
          />
          <ToolbarButton
            icon={manualSaveStatus === 'saving' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            label={
              manualSaveStatus === 'saved'
                ? 'Saved'
                : manualSaveStatus === 'error'
                  ? 'Save failed'
                  : 'Save Project'
            }
            onClick={handleSaveProject}
            disabled={words.length === 0 || manualSaveStatus === 'saving'}
          />
          <ToolbarButton
            icon={<Sparkles className="w-4 h-4" />}
            label="AI"
            active={activePanel === 'ai'}
            onClick={() => togglePanel('ai')}
            disabled={words.length === 0}
          />
          <ToolbarButton
            icon={<Download className="w-4 h-4" />}
            label="Export"
            active={activePanel === 'export'}
            onClick={() => togglePanel('export')}
            disabled={words.length === 0}
          />
          <ToolbarButton
            icon={<Settings className="w-4 h-4" />}
            label="Settings"
            active={activePanel === 'settings'}
            onClick={() => togglePanel('settings')}
          />
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: video + transcript */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 flex min-h-0">
            {/* Video player */}
            <div className="w-1/2 p-3 flex items-center justify-center bg-black/20">
              <VideoPlayer />
            </div>

            {/* Transcript */}
            <div className="w-1/2 border-l border-editor-border flex flex-col min-h-0">
              {isTranscribing ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-4">
                  <Loader2 className="w-8 h-8 text-editor-accent animate-spin" />
                  <p className="text-sm text-editor-text-muted">
                    {transcriptionMessage || 'Transcribing'}... {Math.round(transcriptionProgress)}%
                  </p>
                  {lastTranscriptionJobId && (
                    <button
                      onClick={cancelTranscription}
                      className="rounded bg-editor-border px-3 py-2 text-xs text-editor-text-muted hover:bg-editor-surface hover:text-editor-text"
                    >
                      Cancel transcription
                    </button>
                  )}
                  {transcriptionLogs.length > 0 && (
                    <details className="w-full max-w-md rounded border border-editor-border bg-editor-surface p-2 text-left text-[10px] text-editor-text-muted">
                      <summary className="cursor-pointer text-editor-text">Job log</summary>
                      <div className="mt-2 max-h-32 space-y-1 overflow-y-auto">
                        {transcriptionLogs.slice(-8).map((entry, index) => (
                          <div key={`${entry.time}-${index}`} className="break-words">
                            {new Date(entry.time).toLocaleTimeString()} - {entry.message}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              ) : words.length > 0 ? (
                <TranscriptEditor />
              ) : transcriptionError ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
                  <div className="max-w-md rounded border border-editor-danger/30 bg-editor-danger/10 p-3 text-sm text-editor-danger">
                    {transcriptionError}
                  </div>
                  {lastTranscriptionJobId && (
                    <button
                      onClick={retryTranscription}
                      className="rounded bg-editor-accent px-3 py-2 text-sm font-medium hover:bg-editor-accent-hover"
                    >
                      Retry transcription
                    </button>
                  )}
                  {transcriptionLogs.length > 0 && (
                    <details className="w-full max-w-md rounded border border-editor-border bg-editor-surface p-2 text-left text-[10px] text-editor-text-muted">
                      <summary className="cursor-pointer text-editor-text">Job log</summary>
                      <div className="mt-2 max-h-32 space-y-1 overflow-y-auto">
                        {transcriptionLogs.slice(-8).map((entry, index) => (
                          <div key={`${entry.time}-${index}`} className="break-words">
                            {new Date(entry.time).toLocaleTimeString()} - {entry.message}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-editor-text-muted text-sm">
                  No transcript yet
                </div>
              )}
            </div>
          </div>

          {/* Waveform timeline */}
          <div className="h-32 border-t border-editor-border shrink-0">
            <WaveformTimeline />
          </div>
        </div>

        {/* Right panel (AI / Export / Settings) */}
        {activePanel && (
          <div className="w-80 border-l border-editor-border overflow-y-auto shrink-0">
            {activePanel === 'ai' && <AIPanel />}
            {activePanel === 'export' && <ExportDialog />}
            {activePanel === 'settings' && <SettingsPanel />}
          </div>
        )}
      </div>
    </div>
  );
}

function AutosaveStatus({ autosave }: { autosave: ReturnType<typeof useProjectAutosave> }) {
  if (autosave.status === 'idle') return null;
  if (autosave.status === 'unavailable') {
    return <div className="text-[10px] text-editor-text-muted">Autosave unavailable in browser mode</div>;
  }

  const isError = autosave.status === 'error';
  const label =
    autosave.status === 'saving'
      ? 'Autosaving...'
      : isError
        ? 'Autosave failed'
        : autosave.savedAt
          ? `Autosaved ${new Date(autosave.savedAt).toLocaleTimeString()}`
          : 'Autosaved';

  return (
    <div
      className={`flex max-w-[360px] items-center gap-1 truncate text-[10px] ${
        isError ? 'text-editor-warning' : 'text-editor-text-muted'
      }`}
      title={isError ? autosave.error : autosave.path}
    >
      {isError ? <AlertTriangle className="h-3 w-3 shrink-0" /> : <Save className="h-3 w-3 shrink-0" />}
      <span className="truncate">{label}</span>
    </div>
  );
}

function loadProjectState(data: ReturnType<typeof parseProjectFile>) {
  useEditorStore.getState().loadProject(data);
  useAIStore.getState().loadProjectAIState(data.aiWorkspace);
}

function ToolbarButton({
  icon,
  label,
  active,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
        active
          ? 'bg-editor-accent text-white'
          : 'text-editor-text-muted hover:text-editor-text hover:bg-editor-surface'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      {icon}
      {label}
    </button>
  );
}
