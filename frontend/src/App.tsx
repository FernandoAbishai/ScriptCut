import { useCallback, useEffect, useState, useRef } from 'react';
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
  getAutosaveSnapshotPaths,
  createProjectSnapshot,
  listAutosaveCandidates,
  listRecentProjects,
  parseProjectFile,
  removeAutosaveCandidate,
  removeRecentProject,
  rememberRecentProject,
  useProjectAutosave,
  type AutosaveCandidate,
  type RecentProject,
} from './hooks/useProjectAutosave';
import {
  FolderOpen,
  Settings,
  Sparkles,
  Download,
  Loader2,
  FileInput,
  Save,
  AlertTriangle,
  FileVideo,
  Smartphone,
  CheckCircle,
  RefreshCw,
  Copy,
  Info,
  LogOut,
  MoreHorizontal,
} from 'lucide-react';
import { RELEASE_LINKS } from './utils/releaseInfo';

const IS_ELECTRON = !!window.electronAPI;
const ONBOARDING_DISMISSED_KEY = 'scriptcut.onboarding.dismissed.v1';

type Panel = 'ai' | 'settings' | 'export' | null;
type WorkflowIntent = 'full-video' | 'short';
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
type SystemCheck = {
  ok: boolean;
  label: string;
  detail: string;
};
type SystemChecksResponse = {
  status: string;
  checks: Record<string, SystemCheck>;
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
    setExportOptions,
    setPreviewAspectRatio,
    backendUrl,
  } = useEditorStore();

  const [activePanel, setActivePanel] = useState<Panel>(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [transcriptionEngine, setTranscriptionEngine] = useState<TranscriptionEngine>('auto');
  const [transcriptionModel, setTranscriptionModel] = useState('nvidia/parakeet-tdt-0.6b-v3');
  const [transcriptionEngineStatus, setTranscriptionEngineStatus] = useState<TranscriptionEngineStatus | null>(null);
  const [transcriptionMessage, setTranscriptionMessage] = useState('');
  const [transcriptionError, setTranscriptionError] = useState('');
  const [transcriptionLogs, setTranscriptionLogs] = useState<Array<{ time: string; message: string }>>([]);
  const [lastTranscriptionJobId, setLastTranscriptionJobId] = useState('');
  const [browserUploadName, setBrowserUploadName] = useState('');
  const [browserUploadError, setBrowserUploadError] = useState('');
  const [isBrowserUploading, setIsBrowserUploading] = useState(false);
  const [browserWorkflowIntent, setBrowserWorkflowIntent] = useState<WorkflowIntent>('full-video');
  const [manualSaveStatus, setManualSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [recoveryCandidate, setRecoveryCandidate] = useState<AutosaveCandidate | null>(null);
  const [recoveryError, setRecoveryError] = useState('');
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [systemChecks, setSystemChecks] = useState<SystemChecksResponse | null>(null);
  const [systemChecksError, setSystemChecksError] = useState('');
  const [backendStartupError, setBackendStartupError] = useState('');
  const [isCheckingSystem, setIsCheckingSystem] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(
    () => window.localStorage.getItem(ONBOARDING_DISMISSED_KEY) === 'true',
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  useKeyboardShortcuts();
  const autosave = useProjectAutosave();

  useEffect(() => {
    if (IS_ELECTRON) {
      window.electronAPI!.getBackendUrl().then(setBackendUrl);
      window.electronAPI!.getStartupStatus().then(({ backendError }) => {
        if (!backendError) return;
        setBackendStartupError(`The local editing backend could not start: ${backendError}. Fix the setup issue, then quit and reopen ScriptCut.`);
        setOnboardingDismissed(false);
      });
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

  const refreshSystemChecks = useCallback(async () => {
    setIsCheckingSystem(true);
    setSystemChecksError('');
    try {
      const res = await fetch(`${backendUrl}/system/checks`);
      if (!res.ok) throw new Error(`Setup checks failed: ${res.statusText}`);
      const data = (await res.json()) as SystemChecksResponse;
      setSystemChecks(data);
    } catch (err) {
      setSystemChecksError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCheckingSystem(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    void refreshSystemChecks();
  }, [refreshSystemChecks]);

  const dismissOnboarding = () => {
    window.localStorage.setItem(ONBOARDING_DISMISSED_KEY, 'true');
    setOnboardingDismissed(true);
  };

  const showOnboarding = () => {
    window.localStorage.removeItem(ONBOARDING_DISMISSED_KEY);
    setOnboardingDismissed(false);
    void refreshSystemChecks();
  };

  useEffect(() => {
    if (!IS_ELECTRON || videoPath) return;
    const latest = listAutosaveCandidates()[0] || null;
    setRecoveryCandidate(latest);
    setRecentProjects(listRecentProjects());
    setRecoveryError('');
  }, [videoPath]);

  const refreshRecentProjects = () => setRecentProjects(listRecentProjects());

  const rememberProject = (path: string, data: ReturnType<typeof parseProjectFile>, source: RecentProject['source']) => {
    rememberRecentProject({
      path,
      videoPath: data.videoPath,
      modifiedAt: data.modifiedAt,
      source,
    });
    refreshRecentProjects();
  };

  const handleLoadProject = async () => {
    if (!IS_ELECTRON) return;
    try {
      const projectPath = await window.electronAPI!.openProject();
      if (!projectPath) return;
      const content = await window.electronAPI!.readProjectFile(projectPath);
      const data = parseProjectFile(content);
      loadProjectState(data);
      rememberProject(projectPath, data, 'project');
    } catch (err) {
      console.error('Failed to load project:', err);
      alert(`Failed to load project: ${err}`);
    }
  };

  const recoverAutosave = async (candidate: AutosaveCandidate, snapshotIndex = 0) => {
    if (!IS_ELECTRON) return;
    setRecoveryError('');
    try {
      const path = getAutosaveSnapshotPaths(candidate.videoPath)[snapshotIndex] || candidate.path;
      const content = await window.electronAPI!.readProjectFile(path);
      const data = parseProjectFile(content);
      loadProjectState(data);
      rememberProject(path, data, 'autosave');
    } catch (err) {
      console.error('Failed to recover autosave:', err);
      if (snapshotIndex === 0) {
        removeAutosaveCandidate(candidate.path);
        setRecoveryCandidate(listAutosaveCandidates()[0] || null);
      }
      setRecoveryError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSaveProject = async () => {
    setManualSaveStatus('saving');
    try {
      const savedPath = await saveProject();
      setManualSaveStatus(savedPath ? 'saved' : 'idle');
      if (savedPath) {
        const snapshot = createProjectSnapshot();
        if (snapshot) rememberProject(savedPath, snapshot, 'project');
        window.setTimeout(() => setManualSaveStatus('idle'), 1800);
      }
    } catch (err) {
      console.error('Failed to save project:', err);
      setManualSaveStatus('error');
      window.setTimeout(() => setManualSaveStatus('idle'), 3000);
    }
  };

  const openRecentProject = async (project: RecentProject) => {
    if (!IS_ELECTRON) return;
    try {
      const content = await window.electronAPI!.readProjectFile(project.path);
      const data = parseProjectFile(content);
      loadProjectState(data);
      rememberProject(project.path, data, project.source);
    } catch (err) {
      removeRecentProject(project.path);
      refreshRecentProjects();
      setRecoveryError(err instanceof Error ? `Could not open recent project: ${err.message}` : 'Could not open recent project.');
    }
  };

  const applyWorkflowIntent = useCallback((intent: WorkflowIntent) => {
    if (intent === 'short') {
      setPreviewAspectRatio('vertical');
      setExportOptions((current) => ({
        ...current,
        preset: 'youtube-shorts',
        mode: 'reencode',
        resolution: '1080p',
        aspectRatio: 'vertical',
        reframe: current.reframe || { x: 50, y: 50 },
        format: 'mp4',
        enhanceAudio: false,
        captions: 'burn-in',
        captionStyle: {
          preset: 'creator',
          fontName: current.captionStyle?.fontName || 'Arial',
          fontSize: 58,
          fontColor: current.captionStyle?.fontColor || '#ffffff',
          backgroundColor: '#111827',
          position: current.captionStyle?.position || 'bottom',
          bold: current.captionStyle?.bold ?? true,
          highlightColor: current.captionStyle?.highlightColor || '#facc15',
          wordsPerLine: 5,
          animation: 'pop',
        },
      }));
      return;
    }

    setPreviewAspectRatio('source');
    setExportOptions((current) => ({
      ...current,
      preset: 'source',
      mode: 'fast',
      aspectRatio: 'source',
      captions: 'none',
      enhanceAudio: false,
    }));
  }, [setExportOptions, setPreviewAspectRatio]);

  const handleOpenFile = async (intent: WorkflowIntent = 'full-video') => {
    applyWorkflowIntent(intent);
    if (IS_ELECTRON) {
      const path = await window.electronAPI!.openFile();
      if (path) {
        const restored = await tryRestoreAutosave(path);
        if (restored) return;

        loadVideo(path);
        await transcribeVideo(path, intent);
      }
    } else {
      setBrowserWorkflowIntent(intent);
      fileInputRef.current?.click();
    }
  };

  const handleBrowserFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await uploadBrowserFile(file, browserWorkflowIntent);
  };

  const handleBrowserDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    applyWorkflowIntent('full-video');
    await uploadBrowserFile(file, 'full-video');
  };

  const uploadBrowserFile = async (file: File, intent: WorkflowIntent) => {
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
      await transcribeVideo(data.path, intent);
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
        const content = await window.electronAPI!.readProjectFile(autosavePath);
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

  const transcribeVideo = async (path: string, intent?: WorkflowIntent) => {
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
      if (intent) setActivePanel(intent === 'short' ? 'ai' : 'export');
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

  const handleExit = () => {
    void window.electronAPI?.quit();
  };

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
        {IS_ELECTRON && (
          <button
            type="button"
            onClick={handleExit}
            title="Exit ScriptCut"
            className="absolute right-4 top-4 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-editor-text-muted transition-colors hover:bg-editor-surface hover:text-editor-text"
          >
            <LogOut className="h-4 w-4" />
            Exit
          </button>
        )}
        <div className="flex flex-col items-center gap-3">
          <img
            src="/brand/scriptcut-mark.svg"
            alt=""
            className="h-16 w-16"
          />
          <img
            src="/brand/scriptcut-wordmark.svg"
            alt="ScriptCut"
            className="h-auto w-[220px] max-w-full"
          />
          <p className="text-editor-text-muted text-sm max-w-sm text-center">
            Open-source text-based video editing powered by AI.
          </p>
        </div>

        {!onboardingDismissed && (
          <FirstRunChecklist
            checks={systemChecks?.checks}
            error={backendStartupError || systemChecksError}
            loading={isCheckingSystem}
            isElectron={IS_ELECTRON}
            onRefresh={refreshSystemChecks}
            onDismiss={dismissOnboarding}
          />
        )}

        <details className="w-full max-w-md rounded border border-editor-border bg-editor-surface px-3 py-2 text-xs text-editor-text-muted">
          <summary className="cursor-pointer text-center text-[11px]">Transcription settings</summary>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <select
              value={transcriptionEngine}
              onChange={(e) => {
                const engine = e.target.value as TranscriptionEngine;
                setTranscriptionEngine(engine);
                setTranscriptionModel(TRANSCRIPTION_MODELS[engine][0].value);
              }}
              className="px-3 py-1.5 bg-editor-bg border border-editor-border rounded-md text-xs text-editor-text focus:outline-none focus:border-editor-accent"
            >
              <option value="auto">Auto best available</option>
              <option value="parakeet">Parakeet TDT v3 multilingual</option>
              <option value="whisperx">WhisperX aligned</option>
              <option value="whisper">Whisper fallback</option>
            </select>
            <select
              value={transcriptionModel}
              onChange={(e) => setTranscriptionModel(e.target.value)}
              className="px-3 py-1.5 bg-editor-bg border border-editor-border rounded-md text-xs text-editor-text focus:outline-none focus:border-editor-accent"
            >
              {TRANSCRIPTION_MODELS[transcriptionEngine].map((model) => (
                <option key={model.value} value={model.value}>
                  {model.label}
                </option>
              ))}
            </select>
          </div>
          <p className="mt-2 text-center text-[10px] leading-4">
            {transcriptionEngine === 'parakeet' && !transcriptionEngineStatus?.engines?.parakeet?.available
              ? 'Parakeet needs its optional local package. Auto will choose the best available engine instead.'
              : transcriptionEngine === 'auto'
                ? 'Auto uses the best available local transcription engine.'
                : `${TRANSCRIPTION_MODELS[transcriptionEngine][0]?.label || 'Selected transcription engine'}.`}
          </p>
        </details>

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
                      {getAutosaveSnapshotPaths(recoveryCandidate.videoPath)
                        .slice(1, (recoveryCandidate.snapshotCount || 0) + 1)
                        .map((path, index) => (
                        <button
                          key={path}
                          onClick={() => recoverAutosave(recoveryCandidate, index + 1)}
                          className="rounded bg-editor-surface px-3 py-1.5 text-xs text-editor-text-muted hover:text-editor-text"
                        >
                          Earlier {index + 1}
                        </button>
                      ))}
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
            {recentProjects.length > 0 && (
              <div className="w-full max-w-md rounded-lg border border-editor-border bg-editor-surface p-3 text-left">
                <div className="text-sm font-medium text-editor-text">Recent projects</div>
                <div className="mt-2 space-y-1">
                  {recentProjects.map((project) => (
                    <button
                      key={project.path}
                      onClick={() => openRecentProject(project)}
                      className="flex w-full items-center justify-between gap-3 rounded px-2 py-1.5 text-left hover:bg-editor-bg"
                      title={project.path}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-xs text-editor-text">{project.videoPath.split(/[\\/]/).pop()}</span>
                        <span className="block truncate text-[10px] text-editor-text-muted">
                          {project.source === 'autosave' ? 'Recovered snapshot' : 'Saved project'} · {new Date(project.modifiedAt).toLocaleString()}
                        </span>
                      </span>
                      <FileInput className="h-3.5 w-3.5 shrink-0 text-editor-text-muted" />
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="grid w-full max-w-md grid-cols-1 gap-2 sm:grid-cols-2">
              <StartWorkflowButton
                icon={<FileVideo className="h-4 w-4" />}
                title="Edit full video"
                detail="Trim the transcript, then export"
                onClick={() => void handleOpenFile('full-video')}
              />
              <StartWorkflowButton
                icon={<Smartphone className="h-4 w-4" />}
                title="Create a short"
                detail="9:16 output with creator captions"
                onClick={() => void handleOpenFile('short')}
                primary
              />
            </div>
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
              <div className="grid w-full max-w-md grid-cols-1 gap-2 sm:grid-cols-2">
                <StartWorkflowButton
                  icon={isBrowserUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileVideo className="h-4 w-4" />}
                  title="Edit full video"
                  detail="Choose a file from your folders"
                  onClick={() => void handleOpenFile('full-video')}
                  disabled={isBrowserUploading}
                />
                <StartWorkflowButton
                  icon={<Smartphone className="h-4 w-4" />}
                  title="Create a short"
                  detail="Set up vertical output immediately"
                  onClick={() => void handleOpenFile('short')}
                  disabled={isBrowserUploading}
                  primary
                />
              </div>
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
          <img src="/brand/scriptcut-mark.svg" alt="ScriptCut" className="h-5 w-5" />
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
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMoreMenu((current) => !current)}
              title="More tools"
              className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                showMoreMenu || activePanel === 'settings'
                  ? 'bg-editor-accent text-white'
                  : 'text-editor-text-muted hover:bg-editor-surface hover:text-editor-text'
              }`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {showMoreMenu && (
              <div className="absolute right-0 top-10 z-30 w-40 rounded-md border border-editor-border bg-editor-panel p-1 shadow-xl">
                <button
                  type="button"
                  onClick={() => {
                    togglePanel('settings');
                    setShowMoreMenu(false);
                  }}
                  className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs text-editor-text-muted hover:bg-editor-surface hover:text-editor-text"
                >
                  <Settings className="h-3.5 w-3.5" /> Settings
                </button>
                <button
                  type="button"
                  onClick={() => {
                    showOnboarding();
                    setShowMoreMenu(false);
                  }}
                  className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs text-editor-text-muted hover:bg-editor-surface hover:text-editor-text"
                >
                  <CheckCircle className="h-3.5 w-3.5" /> Setup check
                </button>
                {IS_ELECTRON && (
                  <button
                    type="button"
                    onClick={handleExit}
                    className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs text-editor-text-muted hover:bg-editor-surface hover:text-editor-text"
                  >
                    <LogOut className="h-3.5 w-3.5" /> Exit ScriptCut
                  </button>
                )}
              </div>
            )}
          </div>
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
                <div className="flex-1 flex flex-col items-center justify-center gap-2 px-6 text-center">
                  <div className="text-sm font-medium text-editor-text">Transcript will appear here</div>
                  <p className="max-w-sm text-xs leading-5 text-editor-text-muted">
                    Open media to transcribe it. After transcription, edit words directly to cut video and use the timeline for review.
                  </p>
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

function FirstRunChecklist({
  checks,
  error,
  loading,
  isElectron,
  onRefresh,
  onDismiss,
}: {
  checks?: Record<string, SystemCheck>;
  error: string;
  loading: boolean;
  isElectron: boolean;
  onRefresh: () => void;
  onDismiss: () => void;
}) {
  const rows = [
    checks?.backend || {
      ok: false,
      label: 'Local backend',
      detail: error ? 'Could not start. Read the setup guidance below.' : loading ? 'Checking local editing engine' : 'Local editing engine is not available',
    },
    {
      ok: isElectron,
      label: 'Desktop app',
      detail: isElectron ? 'Native file access ready' : 'Browser mode is for development and testing',
    },
    checks?.python || (error ? {
      ok: false,
      label: 'Python',
      detail: 'The local backend must start before Python can be verified.',
    } : undefined),
    checks?.ffmpeg,
    checks?.captions,
    checks?.transcription,
    checks?.audio,
    checks?.background,
  ].filter(Boolean) as SystemCheck[];
  const requiredReady = rows
    .filter((row) => row.label !== 'Background removal' && row.label !== 'Burn-in captions')
    .every((row) => row.ok);
  const [copiedCommand, setCopiedCommand] = useState('');

  const copyCommand = async (command: string) => {
    await navigator.clipboard?.writeText(command);
    setCopiedCommand(command);
    window.setTimeout(() => setCopiedCommand(''), 1500);
  };

  return (
    <div className="w-full max-w-2xl rounded-lg border border-editor-border bg-editor-surface p-4 text-left shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-editor-text">Setup assistant</div>
          <p className="mt-1 text-xs leading-5 text-editor-text-muted">
            ScriptCut checks the local tools needed for editing and export. Fix warning items first; optional tools can wait.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={onRefresh}
            disabled={loading}
            className="rounded bg-editor-border px-2 py-1 text-[10px] text-editor-text-muted hover:bg-editor-bg disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          </button>
          <button
            onClick={onDismiss}
            className="rounded bg-editor-accent px-2 py-1 text-[10px] font-medium text-white hover:bg-editor-accent-hover"
          >
            Done
          </button>
        </div>
      </div>
      {error && (
        <div className="mt-3 rounded border border-editor-danger/30 bg-editor-danger/10 px-2 py-1 text-[11px] text-editor-danger">
          {error}
        </div>
      )}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {rows.map((row) => {
          const guidance = getSetupGuidance(row);
          const optional = row.label === 'Background removal' || row.label === 'Burn-in captions';
          return (
            <div
              key={row.label}
              className={`flex items-start gap-2 rounded border px-2 py-2 ${
                optional && !row.ok
                  ? 'border-editor-border/70 bg-editor-surface'
                  : 'border-editor-border bg-editor-bg'
              }`}
            >
              {row.ok ? (
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-editor-success" />
              ) : optional ? (
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-editor-text-muted" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-editor-warning" />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-editor-text">{row.label}</div>
                <div className="mt-0.5 text-[11px] leading-4 text-editor-text-muted">{row.detail}</div>
                {!row.ok && guidance && (
                  <div className="mt-2 space-y-1 rounded bg-editor-surface px-2 py-1.5 text-[11px] leading-4 text-editor-text-muted">
                    <div>{guidance.message}</div>
                    {guidance.command && (
                      <button
                        onClick={() => copyCommand(guidance.command || '')}
                        className="inline-flex max-w-full items-center gap-1 rounded bg-editor-border px-2 py-1 text-[10px] text-editor-text-muted hover:bg-editor-bg"
                        title={guidance.command}
                      >
                        <Copy className="h-3 w-3 shrink-0" />
                        <span className="truncate">
                          {copiedCommand === guidance.command ? 'Copied' : guidance.command}
                        </span>
                      </button>
                    )}
                    {guidance.link && (
                      <a
                        href={guidance.link}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex max-w-full items-center gap-1 rounded bg-editor-border px-2 py-1 text-[10px] text-editor-text-muted hover:bg-editor-bg"
                      >
                        <span className="truncate">{guidance.linkLabel || 'Open guide'}</span>
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className={`mt-3 rounded px-2 py-1 text-[11px] ${requiredReady ? 'bg-editor-success/10 text-editor-success' : 'bg-editor-warning/10 text-editor-warning'}`}>
        {requiredReady
          ? 'Core editing and export tools are ready. Optional add-ons can be installed later.'
          : 'Resolve required warnings before serious editing. Background removal is optional.'}
      </div>
    </div>
  );
}

function getSetupGuidance(row: SystemCheck) {
  if (row.ok) return null;

  if (row.label === 'Desktop app') {
    return {
      message: 'Use the installed ScriptCut desktop app for native file access, autosave, and direct exports.',
      link: RELEASE_LINKS.latestRelease,
      linkLabel: 'Download desktop release',
    };
  }

  if (row.label === 'Python') {
    return {
      message: 'This alpha uses Python 3.11 for its local editing engine. Install it once, restart ScriptCut, then refresh these checks.',
      link: RELEASE_LINKS.pythonDownloads,
      linkLabel: 'Install Python for macOS',
    };
  }

  if (row.label === 'Local backend') {
    return {
      message: 'ScriptCut could not start its local editing engine. Follow the setup guide, then restart the app and refresh these checks.',
      link: RELEASE_LINKS.installGuide,
      linkLabel: 'Open setup guide',
    };
  }

  if (row.label === 'FFmpeg') {
    return {
      message: 'Desktop releases include FFmpeg for export. Source builds can install FFmpeg manually.',
      command: 'brew install ffmpeg',
      link: RELEASE_LINKS.latestRelease,
      linkLabel: 'Get desktop release',
    };
  }

  if (row.label === 'Burn-in captions') {
    return {
      message: 'This FFmpeg build exports an .srt caption file. Use an FFmpeg build with libass to burn captions directly into video.',
    };
  }

  if (row.label === 'Transcription') {
    return {
      message: 'Choose Auto or Whisper fallback, or install Parakeet dependencies for the fastest multilingual engine.',
      command: "pip install -U nemo_toolkit['asr']",
    };
  }

  if (row.label === 'Background removal') {
    return {
      message: 'Optional add-on. Install MediaPipe and OpenCV only if you need background removal.',
      command: 'pip install mediapipe opencv-python',
    };
  }

  return {
    message: 'Restart ScriptCut after fixing this item, then run setup checks again.',
  };
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

function StartWorkflowButton({
  icon,
  title,
  detail,
  onClick,
  primary = false,
  disabled = false,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-20 items-start gap-2 rounded-md border px-3 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        primary
          ? 'border-editor-accent bg-editor-accent text-white hover:bg-editor-accent-hover'
          : 'border-editor-border bg-editor-surface text-editor-text hover:border-editor-accent/60 hover:bg-editor-bg'
      }`}
    >
      <span className={`mt-0.5 ${primary ? 'text-white' : 'text-editor-accent'}`}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className={`mt-0.5 block text-[10px] leading-4 ${primary ? 'text-white/80' : 'text-editor-text-muted'}`}>{detail}</span>
      </span>
    </button>
  );
}
