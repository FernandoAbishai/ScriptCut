import { useEffect, useRef, useState, type ChangeEvent, type Dispatch, type DragEvent, type RefObject, type SetStateAction } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Copy,
  FileInput,
  FileVideo,
  Info,
  Loader2,
  LogOut,
  RefreshCw,
  Smartphone,
} from 'lucide-react';
import { RELEASE_LINKS } from '../utils/releaseInfo';
import {
  getCoreReadiness,
  getCoreReadinessBlockers,
  type CoreReadiness,
} from '../utils/homeReadiness';
import { getAutosaveSnapshotPaths, type AutosaveCandidate, type RecentProject } from '../hooks/useProjectAutosave';
import TranscriptionOptions, {
  type TranscriptionEngine,
  type TranscriptionEngineStatus,
} from './TranscriptionOptions';
import CreatorNotice from './CreatorNotice';
import { getCreatorErrorPresentation } from '../utils/creatorErrors';

export type WorkflowIntent = 'full-video' | 'short';
export type { TranscriptionEngine, TranscriptionEngineStatus } from './TranscriptionOptions';
export type SystemCheck = {
  ok: boolean;
  label: string;
  detail: string;
};
export type SystemChecksResponse = {
  status: string;
  checks: Record<string, SystemCheck>;
};

type HomeScreenProps = {
  isElectron: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onExit: () => void;
  onOpenWorkflow: (intent: WorkflowIntent) => void | Promise<void>;
  onLoadProject: () => void | Promise<void>;
  recoveryCandidate: AutosaveCandidate | null;
  recoveryError: string;
  recentProjects: RecentProject[];
  onRecoverAutosave: (candidate: AutosaveCandidate, snapshotIndex?: number) => void | Promise<void>;
  onDismissRecovery: () => void;
  onOpenRecentProject: (project: RecentProject) => void | Promise<void>;
  systemChecks: SystemChecksResponse | null;
  systemChecksError: string;
  backendStartupError: string;
  isCheckingSystem: boolean;
  onboardingDismissed: boolean;
  onRefreshSetup: () => void | Promise<void>;
  onShowSetup: () => void;
  onDismissOnboarding: () => void;
  transcriptionEngine: TranscriptionEngine;
  setTranscriptionEngine: Dispatch<SetStateAction<TranscriptionEngine>>;
  transcriptionModel: string;
  setTranscriptionModel: Dispatch<SetStateAction<string>>;
  transcriptionEngineStatus: TranscriptionEngineStatus | null;
  browserUploadName: string;
  browserUploadError: string;
  isBrowserUploading: boolean;
  onBrowserFileChange: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>;
  onBrowserDrop: (event: DragEvent<HTMLDivElement>) => void | Promise<void>;
};

export default function HomeScreen({
  isElectron,
  fileInputRef,
  onExit,
  onOpenWorkflow,
  onLoadProject,
  recoveryCandidate,
  recoveryError,
  recentProjects,
  onRecoverAutosave,
  onDismissRecovery,
  onOpenRecentProject,
  systemChecks,
  systemChecksError,
  backendStartupError,
  isCheckingSystem,
  onRefreshSetup,
  onShowSetup,
  onDismissOnboarding,
  transcriptionEngine,
  setTranscriptionEngine,
  transcriptionModel,
  setTranscriptionModel,
  transcriptionEngineStatus,
  browserUploadName,
  browserUploadError,
  isBrowserUploading,
  onBrowserFileChange,
  onBrowserDrop,
}: HomeScreenProps) {
  const readiness = getCoreReadiness(systemChecks?.checks, {
    backendStartupError,
    isChecking: isCheckingSystem,
  });
  const [setupDetailsOpen, setSetupDetailsOpen] = useState(false);
  const setupHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (readiness === 'needs-setup') setSetupDetailsOpen(true);
  }, [readiness]);

  useEffect(() => {
    if (setupDetailsOpen) setupHeadingRef.current?.focus();
  }, [setupDetailsOpen]);

  const showSetupDetails = () => {
    setSetupDetailsOpen(true);
    onShowSetup();
  };

  const dismissSetupDetails = () => {
    setSetupDetailsOpen(false);
    onDismissOnboarding();
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-editor-bg px-6 py-10">
      {!isElectron && (
        <input
          ref={fileInputRef}
          type="file"
          accept=".mp4,.avi,.mov,.mkv,.webm,.m4a,.mp3,.wav,.flac,video/*,audio/*"
          className="hidden"
          onChange={onBrowserFileChange}
        />
      )}
      {isElectron && (
        <button
          type="button"
          onClick={onExit}
          className="absolute right-4 top-4 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-editor-text-muted transition-colors hover:bg-editor-surface hover:text-editor-text"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Exit
        </button>
      )}

      <div className="flex flex-col items-center gap-3">
        <img src="./brand/scriptcut-mark.svg" alt="" className="h-16 w-16" />
        <img src="./brand/scriptcut-wordmark.svg" alt="ScriptCut" className="h-auto w-[220px] max-w-full" />
        <p className="max-w-sm text-center text-sm text-editor-text-muted">
          Turn recordings into finished videos and clips.
        </p>
        {!isElectron && (
          <div className="rounded-full border border-editor-border bg-editor-surface px-3 py-1 text-[11px] text-editor-text-muted">
            Development / browser mode
          </div>
        )}
      </div>

      {isElectron ? (
        <div className="w-full max-w-xl space-y-4">
          <div className="text-center text-sm font-medium text-editor-text">What do you want to do?</div>
          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
            <StartWorkflowButton
              icon={<FileVideo className="h-4 w-4" aria-hidden="true" />}
              title="Edit a Video"
              detail="Edit spoken video by editing the transcript"
              onClick={() => void onOpenWorkflow('full-video')}
            />
            <StartWorkflowButton
              icon={<Smartphone className="h-4 w-4" aria-hidden="true" />}
              title="Create Clips"
              detail="Find, review and export social-ready moments"
              onClick={() => void onOpenWorkflow('short')}
            />
          </div>
          <button
            type="button"
            onClick={() => void onLoadProject()}
            className="mx-auto flex items-center gap-2 rounded-lg px-4 py-2 text-sm text-editor-text-muted transition-colors hover:bg-editor-surface hover:text-editor-text"
          >
            <FileInput className="h-4 w-4" aria-hidden="true" />
            Open Project
          </button>
        </div>
      ) : (
        <div className="w-full max-w-xl space-y-4">
          <div className="text-center text-sm font-medium text-editor-text">What do you want to do?</div>
          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
            <StartWorkflowButton
              icon={isBrowserUploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileVideo className="h-4 w-4" aria-hidden="true" />}
              title="Edit a Video"
              detail="Edit spoken video by editing the transcript"
              onClick={() => void onOpenWorkflow('full-video')}
              disabled={isBrowserUploading}
            />
            <StartWorkflowButton
              icon={<Smartphone className="h-4 w-4" aria-hidden="true" />}
              title="Create Clips"
              detail="Find, review and export social-ready moments"
              onClick={() => void onOpenWorkflow('short')}
              disabled={isBrowserUploading}
            />
          </div>
          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={onBrowserDrop}
            className="group flex min-h-40 flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-editor-border bg-editor-surface/45 px-6 py-8 text-center transition-colors hover:border-editor-accent/60 hover:bg-editor-surface/70"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-editor-accent/15 text-editor-accent">
              {isBrowserUploading ? <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" /> : <FileVideo className="h-6 w-6" aria-hidden="true" />}
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium text-editor-text">
                {isBrowserUploading ? 'Uploading media...' : 'Choose a video or audio file'}
              </div>
              <p className="mx-auto max-w-sm text-xs leading-5 text-editor-text-muted">
                Pick a file from your folders or drop it here. ScriptCut uploads it to the local backend before transcription.
              </p>
            </div>
            {browserUploadName && (
              <div className="max-w-full truncate text-[11px] text-editor-text-muted">
                {isBrowserUploading ? 'Uploading' : 'Last selected'}: {browserUploadName}
              </div>
            )}
          </div>
          {browserUploadError && (
            <CreatorNotice notice={getCreatorErrorPresentation('media-upload', browserUploadError)} />
          )}
          <p className="text-center text-[11px] text-editor-text-muted">
            Use the desktop app for native file access, autosave and direct exports. Supported: MP4, AVI, MOV, MKV, WebM, M4A, MP3, WAV, FLAC.
          </p>
        </div>
      )}

      {isElectron && (recoveryCandidate || recentProjects.length > 0) && (
        <section className="w-full max-w-xl rounded-lg border border-editor-border bg-editor-surface p-4 text-left" aria-labelledby="resume-work-heading">
          <h2 id="resume-work-heading" className="text-sm font-semibold text-editor-text">Resume your work</h2>
          {recoveryCandidate && (
            <div className="mt-3 rounded-lg border border-editor-warning/30 bg-editor-warning/10 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-editor-warning" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-editor-text">Recover your last session</div>
                  <div className="mt-1 truncate text-[11px] text-editor-text-muted" title={recoveryCandidate.videoPath}>
                    {recoveryCandidate.videoPath.split(/[\\/]/).pop()} · Autosaved {new Date(recoveryCandidate.modifiedAt).toLocaleString()}
                  </div>
                  {recoveryError && <CreatorNotice className="mt-2" notice={getCreatorErrorPresentation('recovery', recoveryError)} />}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void onRecoverAutosave(recoveryCandidate)}
                      className="rounded bg-editor-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-editor-accent-hover"
                    >
                      Recover
                    </button>
                    {getAutosaveEarlierPaths(recoveryCandidate).map(({ path, index }) => (
                      <button
                        type="button"
                        key={path}
                        onClick={() => void onRecoverAutosave(recoveryCandidate, index)}
                        className="rounded bg-editor-surface px-3 py-1.5 text-xs text-editor-text-muted hover:text-editor-text"
                      >
                        Earlier {index}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={onDismissRecovery}
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
            <div className={recoveryCandidate ? 'mt-4' : 'mt-3'}>
              <h3 className="text-xs font-medium text-editor-text">Recent projects</h3>
              <div className="mt-2 space-y-1">
                {recentProjects.map((project) => (
                  <button
                    type="button"
                    key={project.path}
                    onClick={() => void onOpenRecentProject(project)}
                    className="flex w-full items-center justify-between gap-3 rounded px-2 py-1.5 text-left hover:bg-editor-bg"
                    title={project.path}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-xs text-editor-text">{project.videoPath.split(/[\\/]/).pop()}</span>
                      <span className="block truncate text-[10px] text-editor-text-muted">
                        {project.source === 'autosave' ? 'Recovered snapshot' : 'Saved project'} · {new Date(project.modifiedAt).toLocaleString()}
                      </span>
                    </span>
                    <FileInput className="h-3.5 w-3.5 shrink-0 text-editor-text-muted" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <SetupStatusCard
        readiness={readiness}
        checks={systemChecks?.checks}
        backendStartupError={backendStartupError}
        systemChecksError={systemChecksError}
        isElectron={isElectron}
        onShowSetup={showSetupDetails}
      />

      {setupDetailsOpen && (
        <FirstRunChecklist
          checks={systemChecks?.checks}
          error={backendStartupError || systemChecksError}
          loading={isCheckingSystem}
          isElectron={isElectron}
          readiness={readiness}
          onRefresh={onRefreshSetup}
          onDismiss={dismissSetupDetails}
          headingRef={setupHeadingRef}
        />
      )}

      <AdvancedTranscriptionSettings
        transcriptionEngine={transcriptionEngine}
        setTranscriptionEngine={setTranscriptionEngine}
        transcriptionModel={transcriptionModel}
        setTranscriptionModel={setTranscriptionModel}
        transcriptionEngineStatus={transcriptionEngineStatus}
      />
    </div>
  );
}

function SetupStatusCard({
  readiness,
  checks,
  backendStartupError,
  systemChecksError,
  isElectron,
  onShowSetup,
}: {
  readiness: CoreReadiness;
  checks?: Record<string, SystemCheck>;
  backendStartupError: string;
  systemChecksError: string;
  isElectron: boolean;
  onShowSetup: () => void;
}) {
  const blockers = getCoreReadinessBlockers(checks);
  const isBlocked = readiness === 'needs-setup';
  const title = readiness === 'ready' ? '✓ Ready to edit' : readiness === 'needs-setup' ? '⚠ Setup needs attention' : 'Checking setup';
  const detail = backendStartupError
    ? 'ScriptCut couldn’t start its editing service. Open Setup Check to see what needs attention, then restart ScriptCut.'
    : blockers.includes('backend') || blockers.includes('python')
      ? 'Local editing needs setup before you can start.'
      : blockers.includes('transcription')
        ? 'Transcription needs setup before you can edit a video.'
        : blockers.includes('ffmpeg')
          ? 'Export needs setup before you can finish a video.'
          : systemChecksError
            ? 'Setup checks could not finish. Review the details when needed.'
            : readiness === 'ready'
              ? 'Core editing and export tools are available.'
              : 'Checking the core editing and export tools.';

  return (
    <section
      className={`w-full max-w-xl rounded-lg border p-3 ${isBlocked ? 'border-editor-warning/40 bg-editor-warning/10' : 'border-editor-border bg-editor-surface'}`}
      aria-labelledby="setup-status-heading"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="setup-status-heading" className={`text-sm font-medium ${isBlocked ? 'text-editor-warning' : 'text-editor-text'}`}>
            {title}
          </h2>
          <p className="mt-1 text-xs leading-5 text-editor-text-muted">{detail}</p>
          {!isElectron && <p className="mt-1 text-[11px] leading-4 text-editor-text-muted">Desktop is recommended for native file access, autosave and direct exports.</p>}
        </div>
        <button
          type="button"
          onClick={onShowSetup}
          className="shrink-0 rounded bg-editor-border px-3 py-1.5 text-xs font-medium text-editor-text-muted hover:bg-editor-bg hover:text-editor-text"
        >
          {isBlocked ? 'Fix Setup' : 'Setup details'}
        </button>
      </div>
    </section>
  );
}

function FirstRunChecklist({
  checks,
  error,
  loading,
  isElectron,
  readiness,
  onRefresh,
  onDismiss,
  headingRef,
}: {
  checks?: Record<string, SystemCheck>;
  error: string;
  loading: boolean;
  isElectron: boolean;
  readiness: CoreReadiness;
  onRefresh: () => void;
  onDismiss: () => void;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const rows = [
    checks?.backend || {
      ok: false,
      label: 'Local backend',
      detail: error ? 'Local editing could not start. Review the repair guidance below.' : loading ? 'Checking local editing' : 'Local editing is not available',
    },
    {
      ok: isElectron,
      label: 'Desktop app',
      detail: isElectron ? 'Native file access ready' : 'Browser mode is for development and testing',
    },
    checks?.python || (error ? {
      ok: false,
      label: 'Python',
      detail: 'The local editing runtime must start before it can be verified.',
    } : undefined),
    checks?.ffmpeg,
    checks?.captions,
    checks?.transcription,
    checks?.audio,
    checks?.background,
  ].filter(Boolean) as SystemCheck[];
  const [copiedCommand, setCopiedCommand] = useState('');

  const copyCommand = async (command: string) => {
    await navigator.clipboard?.writeText(command);
    setCopiedCommand(command);
    window.setTimeout(() => setCopiedCommand(''), 1500);
  };

  return (
    <section className="w-full max-w-xl rounded-lg border border-editor-border bg-editor-surface p-4 text-left shadow-lg" aria-labelledby="setup-details-heading">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="setup-details-heading" ref={headingRef} tabIndex={-1} className="text-sm font-semibold text-editor-text">Setup details</h2>
          <p className="mt-1 text-xs leading-5 text-editor-text-muted">
            Review the capabilities needed for editing and export. Optional add-ons can wait.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 rounded bg-editor-border px-2 py-1 text-[10px] text-editor-text-muted hover:bg-editor-bg disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3 w-3" aria-hidden="true" />}
            Refresh
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded bg-editor-accent px-2 py-1 text-[10px] font-medium text-white hover:bg-editor-accent-hover"
          >
            Hide details
          </button>
        </div>
      </div>
      {error && (
        <CreatorNotice className="mt-3" notice={getCreatorErrorPresentation('setup', error)} />
      )}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {rows.map((row) => {
          const guidance = getSetupGuidance(row, isElectron);
          const optional = isOptionalCheck(row);
          const importance = getCheckImportance(row);
          const displayLabel = getCreatorCheckLabel(row);
          return (
            <div
              key={row.label}
              className={`flex items-start gap-2 rounded border px-2 py-2 ${
                importance !== 'Required' && !row.ok ? 'border-editor-border/70 bg-editor-surface' : 'border-editor-border bg-editor-bg'
              }`}
            >
              {row.ok ? (
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-editor-success" aria-hidden="true" />
              ) : optional || importance === 'Recommended' ? (
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-editor-text-muted" aria-hidden="true" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-editor-warning" aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs font-medium text-editor-text">
                  <span>{displayLabel}</span>
                  <span className="rounded border border-editor-border px-1.5 py-0.5 text-[9px] font-normal text-editor-text-muted">
                    {importance}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] leading-4 text-editor-text-muted">{row.detail}</div>
                {!row.ok && guidance && (
                  <div className="mt-2 space-y-1 rounded bg-editor-surface px-2 py-1.5 text-[11px] leading-4 text-editor-text-muted">
                    <div>{guidance.message}</div>
                    {guidance.command && (
                      <button
                        type="button"
                        onClick={() => void copyCommand(guidance.command || '')}
                        className="inline-flex max-w-full items-center gap-1 rounded bg-editor-border px-2 py-1 text-[10px] text-editor-text-muted hover:bg-editor-bg"
                        title={guidance.command}
                      >
                        <Copy className="h-3 w-3 shrink-0" aria-hidden="true" />
                        <span className="truncate">{copiedCommand === guidance.command ? 'Copied' : guidance.command}</span>
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
      <div className={`mt-3 rounded px-2 py-1 text-[11px] ${readiness === 'ready' ? 'bg-editor-success/10 text-editor-success' : readiness === 'needs-setup' ? 'bg-editor-warning/10 text-editor-warning' : 'bg-editor-border text-editor-text-muted'}`}>
        {readiness === 'ready'
          ? 'Core editing and export tools are ready. Optional add-ons can be installed later.'
          : readiness === 'needs-setup'
            ? 'Fix the highlighted required capability before starting a workflow.'
            : 'Checking core editing and export capabilities.'}
      </div>
    </section>
  );
}

function AdvancedTranscriptionSettings({
  transcriptionEngine,
  setTranscriptionEngine,
  transcriptionModel,
  setTranscriptionModel,
  transcriptionEngineStatus,
}: {
  transcriptionEngine: TranscriptionEngine;
  setTranscriptionEngine: Dispatch<SetStateAction<TranscriptionEngine>>;
  transcriptionModel: string;
  setTranscriptionModel: Dispatch<SetStateAction<string>>;
  transcriptionEngineStatus: TranscriptionEngineStatus | null;
}) {
  return (
    <details className="w-full max-w-xl rounded border border-editor-border bg-editor-surface px-3 py-2 text-xs text-editor-text-muted">
      <summary className="cursor-pointer text-sm font-medium text-editor-text">
        Advanced transcription · {transcriptionEngine === 'auto' ? 'Automatic — Recommended' : 'Manual selection'}
      </summary>
      <div className="mt-3 rounded bg-editor-bg px-3 py-2">
        <div className="text-xs font-medium text-editor-text">Automatic — Recommended</div>
        <p className="mt-1 text-[11px] leading-4">ScriptCut chooses the best available local transcription engine. Manual engine and model choices remain available below.</p>
      </div>
      <div className="mt-3">
        <TranscriptionOptions
          transcriptionEngine={transcriptionEngine}
          onEngineChange={setTranscriptionEngine}
          transcriptionModel={transcriptionModel}
          onModelChange={setTranscriptionModel}
          transcriptionEngineStatus={transcriptionEngineStatus}
          onUseAutomatic={() => {
            setTranscriptionEngine('auto');
            setTranscriptionModel('base');
          }}
        />
      </div>
    </details>
  );
}

function StartWorkflowButton({
  icon,
  title,
  detail,
  onClick,
  disabled = false,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-24 items-start gap-2 rounded-md border border-editor-border bg-editor-surface px-3 py-3 text-left text-editor-text transition-colors hover:border-editor-accent/60 hover:bg-editor-bg disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="mt-0.5 text-editor-accent">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-4 text-editor-text-muted">{detail}</span>
      </span>
    </button>
  );
}

function getAutosaveEarlierPaths(candidate: AutosaveCandidate) {
  return getAutosaveSnapshotPaths(candidate.videoPath)
    .slice(1, (candidate.snapshotCount || 0) + 1)
    .map((path, index) => ({ path, index: index + 1 }));
}

function isOptionalCheck(row: SystemCheck) {
  return row.label === 'Background removal' || row.label === 'Studio Sound' || row.label === 'Burn-in captions' || row.label === 'Audio';
}

function getCheckImportance(row: SystemCheck) {
  if (isOptionalCheck(row)) return 'Optional';
  if (row.label === 'Desktop app') return 'Recommended';
  return 'Required';
}

function getCreatorCheckLabel(row: SystemCheck) {
  if (row.label === 'Local backend') return 'Local editing';
  if (row.label === 'Python') return 'Local editing runtime';
  if (row.label === 'FFmpeg') return 'Video export';
  if (row.label === 'Transcription') return 'Transcription';
  if (row.label === 'Audio') return 'Audio enhancement';
  return row.label;
}

function getSetupGuidance(row: SystemCheck, isElectron: boolean) {
  if (row.ok) return null;

  if (row.label === 'Desktop app') {
    return {
      message: 'Use the installed ScriptCut desktop app for native file access, autosave, and direct exports.',
      link: RELEASE_LINKS.releases,
      linkLabel: 'Download desktop release',
    };
  }

  if (row.label === 'Python') {
    if (isElectron) {
      return {
        message: 'The ScriptCut desktop app includes its local editing runtime. Restart ScriptCut. If the problem continues, reinstall the official ScriptCut DMG.',
        link: RELEASE_LINKS.releases,
        linkLabel: 'Reinstall official DMG',
      };
    }
    return {
      message: 'Source development uses Python 3.11 for the local editing engine. Install it once, restart ScriptCut, then refresh these checks.',
      link: RELEASE_LINKS.pythonDownloads,
      linkLabel: 'Python source setup',
    };
  }

  if (row.label === 'Local backend') {
    if (isElectron) {
      return {
        message: "ScriptCut couldn't start or reach its local editing service. Restart the app. If the problem continues, review Technical details.",
      };
    }
    return {
      message: 'ScriptCut could not start its local editing engine. Follow the setup guide, then restart the app and refresh these checks.',
      link: RELEASE_LINKS.installGuide,
      linkLabel: 'Open setup guide',
    };
  }

  if (row.label === 'FFmpeg') {
    if (isElectron) {
      return {
        message: 'Desktop releases include the video export engine. Reinstall the official ScriptCut DMG if this component is missing.',
        link: RELEASE_LINKS.releases,
        linkLabel: 'Reinstall official DMG',
      };
    }
    return {
      message: 'Desktop releases include FFmpeg for export. Source builds can install FFmpeg manually.',
      command: 'brew install ffmpeg',
      link: RELEASE_LINKS.releases,
      linkLabel: 'Get desktop release',
    };
  }

  if (row.label === 'Burn-in captions') {
    return {
      message: 'This FFmpeg build exports an .srt caption file. Use an FFmpeg build with libass to burn captions directly into video.',
    };
  }

  if (row.label === 'Transcription') {
    if (isElectron) {
      return {
        message: 'Baseline Whisper transcription is included in this desktop release. Restart ScriptCut; if it remains unavailable, reinstall the official ScriptCut DMG.',
        link: RELEASE_LINKS.releases,
        linkLabel: 'Reinstall official DMG',
      };
    }
    return {
      message: 'Choose Auto or Whisper fallback, or install Parakeet dependencies for the fastest multilingual engine.',
      command: "pip install -U nemo_toolkit['asr']",
    };
  }

  if (row.label === 'Background removal') {
    if (isElectron) {
      return {
        message: 'This optional capability is not included in the desktop release. Core editing and export do not require it.',
      };
    }
    return {
      message: 'Optional add-on. Install MediaPipe and OpenCV only if you need background removal.',
      command: 'pip install mediapipe opencv-python',
    };
  }

  return {
    message: 'Restart ScriptCut after fixing this item, then run setup checks again.',
  };
}
