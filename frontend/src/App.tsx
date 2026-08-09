import { useCallback, useEffect, useState, useRef } from 'react';
import { useEditorStore } from './store/editorStore';
import { useAIStore } from './store/aiStore';
import VideoPlayer from './components/VideoPlayer';
import TranscriptEditor from './components/TranscriptEditor';
import WaveformTimeline from './components/WaveformTimeline';
import AIPanel from './components/AIPanel';
import ExportDialog from './components/ExportDialog';
import SettingsPanel from './components/SettingsPanel';
import EditorTaskHeader from './components/EditorTaskHeader';
import HomeScreen, {
  type SystemChecksResponse,
  type WorkflowIntent,
} from './components/HomeScreen';
import TranscriptionStatus from './components/TranscriptionStatus';
import CreatorDialog from './components/CreatorDialog';
import CreatorNotice, { type CreatorNoticeData } from './components/CreatorNotice';
import {
  AUTOMATIC_TRANSCRIPTION_MODEL,
  type TranscriptionEngine,
  type TranscriptionEngineStatus,
} from './utils/transcriptionModels';
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
  Film,
  Settings,
  Sparkles,
  Download,
  Loader2,
  Save,
  AlertTriangle,
  CheckCircle,
  LogOut,
  MoreHorizontal,
} from 'lucide-react';
import { getCoreReadiness } from './utils/homeReadiness';
import {
  getEditorTaskPresentation,
  getPostTranscriptionPanel,
  type EditorPanel,
  type EditorWorkflow,
} from './utils/editorTask';
import { getCreatorErrorPresentation } from './utils/creatorErrors';

const IS_ELECTRON = !!window.electronAPI;
const ONBOARDING_DISMISSED_KEY = 'scriptcut.onboarding.dismissed.v1';

type Panel = EditorPanel;

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
    deletedRanges,
    editOperations,
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
  const [editorWorkflow, setEditorWorkflow] = useState<EditorWorkflow>('full-video');
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [transcriptionEngine, setTranscriptionEngine] = useState<TranscriptionEngine>('auto');
  const [transcriptionModel, setTranscriptionModel] = useState(AUTOMATIC_TRANSCRIPTION_MODEL);
  const [transcriptionEngineStatus, setTranscriptionEngineStatus] = useState<TranscriptionEngineStatus | null>(null);
  const [transcriptionMessage, setTranscriptionMessage] = useState('');
  const [transcriptionError, setTranscriptionError] = useState('');
  const [transcriptionLogs, setTranscriptionLogs] = useState<Array<{ time: string; message: string }>>([]);
  const [lastTranscriptionJobId, setLastTranscriptionJobId] = useState('');
  const [browserUploadName, setBrowserUploadName] = useState('');
  const [browserUploadError, setBrowserUploadError] = useState('');
  const [isBrowserUploading, setIsBrowserUploading] = useState(false);
  const [browserWorkflowIntent, setBrowserWorkflowIntent] = useState<WorkflowIntent>('full-video');
  const transcriptionIntentRef = useRef<WorkflowIntent | null>(null);
  const [lastTranscriptionPath, setLastTranscriptionPath] = useState('');
  const [manualSaveStatus, setManualSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [recoveryCandidate, setRecoveryCandidate] = useState<AutosaveCandidate | null>(null);
  const [recoveryError, setRecoveryError] = useState('');
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [systemChecks, setSystemChecks] = useState<SystemChecksResponse | null>(null);
  const [systemChecksError, setSystemChecksError] = useState('');
  const [backendStartupError, setBackendStartupError] = useState('');
  const [creatorNotice, setCreatorNotice] = useState<CreatorNoticeData | null>(null);
  const [autosaveRestoreRequest, setAutosaveRestoreRequest] = useState<{
    data: ReturnType<typeof parseProjectFile>;
    resolve: (restore: boolean) => void;
  } | null>(null);
  const [isCheckingSystem, setIsCheckingSystem] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(
    () => window.localStorage.getItem(ONBOARDING_DISMISSED_KEY) === 'true',
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const moreToolsButtonRef = useRef<HTMLButtonElement>(null);

  useKeyboardShortcuts();
  const autosave = useProjectAutosave();

  useEffect(() => {
    if (IS_ELECTRON) {
      window.electronAPI!.getBackendUrl().then(setBackendUrl);
      window.electronAPI!.getStartupStatus().then(({ backendError }) => {
        if (!backendError) return;
        setBackendStartupError(String(backendError));
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

  useEffect(() => {
    if (!showMoreMenu) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setShowMoreMenu(false);
      moreToolsButtonRef.current?.focus();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [showMoreMenu]);

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
    setCreatorNotice(null);
    try {
      const projectPath = await window.electronAPI!.openProject();
      if (!projectPath) return;
      const content = await window.electronAPI!.readProjectFile(projectPath);
      const data = parseProjectFile(content);
      loadProjectState(data);
      setEditorWorkflow('project');
      rememberProject(projectPath, data, 'project');
    } catch (err) {
      console.error('Failed to load project:', err);
      setCreatorNotice({
        ...getCreatorErrorPresentation('project-load', err),
        actionLabel: 'Try Again',
        onAction: handleLoadProject,
        onDismiss: () => setCreatorNotice(null),
      });
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
      setEditorWorkflow('project');
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
    setCreatorNotice(null);
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
      setCreatorNotice({
        ...getCreatorErrorPresentation('project-save', err),
        actionLabel: 'Try Again',
        onAction: handleSaveProject,
        onDismiss: () => setCreatorNotice(null),
      });
      window.setTimeout(() => setManualSaveStatus('idle'), 3000);
    }
  };

  const openRecentProject = async (project: RecentProject) => {
    if (!IS_ELECTRON) return;
    setCreatorNotice(null);
    try {
      const content = await window.electronAPI!.readProjectFile(project.path);
      const data = parseProjectFile(content);
      loadProjectState(data);
      setEditorWorkflow('project');
      rememberProject(project.path, data, project.source);
    } catch (err) {
      removeRecentProject(project.path);
      refreshRecentProjects();
      setCreatorNotice({
        ...getCreatorErrorPresentation('recent-project', err),
        onDismiss: () => setCreatorNotice(null),
      });
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
    if (IS_ELECTRON) {
      const path = await window.electronAPI!.openFile();
      if (path) {
        setEditorWorkflow(intent);
        applyWorkflowIntent(intent);
        const restored = await tryRestoreAutosave(path);
        if (restored) return;

        loadVideo(path);
        await transcribeVideo(path, intent);
      }
    } else {
      applyWorkflowIntent(intent);
      setBrowserWorkflowIntent(intent);
      fileInputRef.current?.click();
    }
  };

  const handleBrowserFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setEditorWorkflow(browserWorkflowIntent);
    await uploadBrowserFile(file, browserWorkflowIntent);
  };

  const handleBrowserDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    setEditorWorkflow('full-video');
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

        const shouldRestore = await new Promise<boolean>((resolve) => {
          setAutosaveRestoreRequest({ data, resolve });
        });
        if (!shouldRestore) return false;

        loadProjectState(data);
        return true;
      } catch {
        // Try the next autosave naming convention.
      }
    }

    return false;
  };

  const completeTranscription = (
    data: Parameters<typeof setTranscription>[0],
    intent?: WorkflowIntent | null,
  ) => {
    setTranscription(data);
    const resolvedIntent = intent ?? transcriptionIntentRef.current;
    setActivePanel(getPostTranscriptionPanel(resolvedIntent));
  };

  const transcribeVideo = async (path: string, intent?: WorkflowIntent) => {
    setLastTranscriptionPath(path);
    if (intent) transcriptionIntentRef.current = intent;
    setTranscribing(true, 0);
    setTranscriptionMessage('Preparing your transcript');
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
      completeTranscription(data, intent);
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
      completeTranscription(data, transcriptionIntentRef.current);
    } catch (err) {
      console.error('Transcription retry error:', err);
      setTranscriptionError(err instanceof Error ? err.message : String(err));
    } finally {
      setTranscriptionMessage('');
      setTranscribing(false);
    }
  };

  const startTranscriptionWithSettings = async () => {
    if (!lastTranscriptionPath) return;
    await transcribeVideo(lastTranscriptionPath, transcriptionIntentRef.current ?? undefined);
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

  const coreReadiness = getCoreReadiness(systemChecks?.checks, {
    backendStartupError,
    isChecking: isCheckingSystem,
  });

  const handleStartWorkflow = async (intent: WorkflowIntent) => {
    if (coreReadiness === 'needs-setup') {
      showOnboarding();
      return;
    }
    await handleOpenFile(intent);
  };

  const taskPresentation = getEditorTaskPresentation({
    workflow: editorWorkflow,
    isTranscribing,
    hasTranscriptionError: Boolean(transcriptionError),
    wordCount: words.length,
    cutCount: deletedRanges.length,
    layerCount: editOperations.filter((operation) => operation.kind !== 'delete').length,
    activePanel,
  });

  const sidePanelLabel = activePanel === 'ai'
    ? editorWorkflow === 'short' ? 'Create Clips' : 'AI tools'
    : activePanel === 'export' ? 'Export' : 'Settings';

  const resolveAutosaveRestore = (restore: boolean) => {
    const request = autosaveRestoreRequest;
    setAutosaveRestoreRequest(null);
    request?.resolve(restore);
  };

  const appNotice = creatorNotice && (
    <CreatorNotice notice={creatorNotice} className="fixed bottom-4 right-4 z-40 w-[min(28rem,calc(100vw-2rem))]" />
  );
  const autosaveRestoreDialog = (
    <CreatorDialog
      open={Boolean(autosaveRestoreRequest)}
      title="Autosaved work found"
      description="ScriptCut found saved work for this media. Restore it or start a new transcription."
      onClose={() => resolveAutosaveRestore(false)}
    >
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => resolveAutosaveRestore(false)}
          className="rounded border border-editor-border px-3 py-2 text-xs text-editor-text-muted hover:bg-editor-surface"
        >
          Start new transcription
        </button>
        <button
          type="button"
          onClick={() => resolveAutosaveRestore(true)}
          className="rounded bg-editor-accent px-3 py-2 text-xs font-medium text-white hover:bg-editor-accent-hover"
        >
          Restore autosave
        </button>
      </div>
    </CreatorDialog>
  );

  if (!videoPath) {
    return (
      <>
        <HomeScreen
        isElectron={IS_ELECTRON}
        fileInputRef={fileInputRef}
        onExit={handleExit}
        onOpenWorkflow={handleStartWorkflow}
        onLoadProject={handleLoadProject}
        recoveryCandidate={recoveryCandidate}
        recoveryError={recoveryError}
        recentProjects={recentProjects}
        onRecoverAutosave={recoverAutosave}
        onDismissRecovery={() => setRecoveryCandidate(null)}
        onOpenRecentProject={openRecentProject}
        systemChecks={systemChecks}
        systemChecksError={systemChecksError}
        backendStartupError={backendStartupError}
        isCheckingSystem={isCheckingSystem}
        onboardingDismissed={onboardingDismissed}
        onRefreshSetup={refreshSystemChecks}
        onShowSetup={showOnboarding}
        onDismissOnboarding={dismissOnboarding}
        transcriptionEngine={transcriptionEngine}
        setTranscriptionEngine={setTranscriptionEngine}
        transcriptionModel={transcriptionModel}
        setTranscriptionModel={setTranscriptionModel}
        transcriptionEngineStatus={transcriptionEngineStatus}
        browserUploadName={browserUploadName}
        browserUploadError={browserUploadError}
        isBrowserUploading={isBrowserUploading}
        onBrowserFileChange={handleBrowserFileChange}
        onBrowserDrop={handleBrowserDrop}
        />
        {appNotice}
        {autosaveRestoreDialog}
      </>
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
            icon={editorWorkflow === 'short' ? <Film className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
            label={editorWorkflow === 'short' ? 'Create Clips' : 'AI'}
            active={activePanel === 'ai'}
            onClick={() => togglePanel('ai')}
            disabled={words.length === 0}
            controls="editor-side-panel"
            expanded={activePanel === 'ai'}
          />
          <ToolbarButton
            icon={<Download className="w-4 h-4" />}
            label="Export"
            active={activePanel === 'export'}
            onClick={() => togglePanel('export')}
            disabled={words.length === 0}
            controls="editor-side-panel"
            expanded={activePanel === 'export'}
          />
          <div className="relative">
            <button
              type="button"
              ref={moreToolsButtonRef}
              onClick={() => setShowMoreMenu((current) => !current)}
              title="More tools"
              aria-label="More tools"
              aria-expanded={showMoreMenu}
              aria-controls="editor-more-menu"
              className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                showMoreMenu || activePanel === 'settings'
                  ? 'bg-editor-accent text-white'
                  : 'text-editor-text-muted hover:bg-editor-surface hover:text-editor-text'
              }`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {showMoreMenu && (
              <div id="editor-more-menu" className="absolute right-0 top-10 z-30 w-40 rounded-md border border-editor-border bg-editor-panel p-1 shadow-xl">
                <button
                  type="button"
                  onClick={() => {
                    togglePanel('settings');
                    setShowMoreMenu(false);
                  }}
                  aria-expanded={activePanel === 'settings'}
                  aria-controls="editor-side-panel"
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

      <EditorTaskHeader presentation={taskPresentation} />

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
                <TranscriptionStatus
                  isTranscribing
                  progress={transcriptionProgress}
                  message={transcriptionMessage}
                  error={transcriptionError}
                  logs={transcriptionLogs}
                  lastJobId={lastTranscriptionJobId}
                  transcriptionEngine={transcriptionEngine}
                  onEngineChange={setTranscriptionEngine}
                  transcriptionModel={transcriptionModel}
                  onModelChange={setTranscriptionModel}
                  transcriptionEngineStatus={transcriptionEngineStatus}
                  onCancel={cancelTranscription}
                  onUseAutomatic={() => {
                    setTranscriptionEngine('auto');
                    setTranscriptionModel(AUTOMATIC_TRANSCRIPTION_MODEL);
                  }}
                />
              ) : transcriptionError ? (
                <TranscriptionStatus
                  isTranscribing={false}
                  progress={transcriptionProgress}
                  message={transcriptionMessage}
                  error={transcriptionError}
                  logs={transcriptionLogs}
                  lastJobId={lastTranscriptionJobId}
                  transcriptionEngine={transcriptionEngine}
                  onEngineChange={setTranscriptionEngine}
                  transcriptionModel={transcriptionModel}
                  onModelChange={setTranscriptionModel}
                  transcriptionEngineStatus={transcriptionEngineStatus}
                  onCancel={cancelTranscription}
                  onRetry={retryTranscription}
                  onUseAutomatic={() => {
                    setTranscriptionEngine('auto');
                    setTranscriptionModel(AUTOMATIC_TRANSCRIPTION_MODEL);
                  }}
                  onStartWithSettings={startTranscriptionWithSettings}
                />
              ) : words.length > 0 ? (
                <TranscriptEditor />
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
          <aside
            id="editor-side-panel"
            role="region"
            aria-label={sidePanelLabel}
            className="w-80 border-l border-editor-border overflow-y-auto shrink-0"
          >
            {activePanel === 'ai' && <AIPanel mode={editorWorkflow === 'short' ? 'clips' : 'general'} />}
            {activePanel === 'export' && <ExportDialog />}
            {activePanel === 'settings' && <SettingsPanel />}
          </aside>
        )}
      </div>
      {appNotice}
      {autosaveRestoreDialog}
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
  controls,
  expanded,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
  controls?: string;
  expanded?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-expanded={controls ? expanded ?? active ?? false : undefined}
      aria-controls={controls}
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
