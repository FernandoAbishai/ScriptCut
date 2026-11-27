import { useEffect, useRef, useState, type ChangeEvent, type Dispatch, type DragEvent, type RefObject, type SetStateAction } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowRight,
  AudioLines,
  ChevronDown,
  Clapperboard,
  BookOpen,
  CheckCircle,
  Copy,
  FileInput,
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
  onOpenSample: () => void | Promise<void>;
  isOpeningSample: boolean;
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
  onOpenSample,
  isOpeningSample,
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

  const setupButtonRef = useRef<HTMLButtonElement>(null);
  const workflowPending = isElectron ? isCheckingSystem || isOpeningSample : isBrowserUploading;

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
    setupButtonRef.current?.focus();
  };

  return (
    <div className="start-screen">
      {!isElectron && (
        <input
          ref={fileInputRef}
          type="file"
          accept=".mp4,.avi,.mov,.mkv,.webm,.m4a,.mp3,.wav,.flac,video/*,audio/*"
          className="hidden"
          onChange={onBrowserFileChange}
        />
      )}
      <header className="start-topbar">
        <div className="start-topbar-inner">
          <div className="flex shrink-0 items-center gap-1.5">
            <img src="./brand/scriptcut-mark.svg" alt="" className="h-9 w-9" />
            <span className="start-brand">ScriptCut</span>
          </div>
          {isElectron ? (
            <button type="button" onClick={onExit} className="start-utility-button">
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Exit
            </button>
          ) : (
            <span className="text-xs text-editor-text-muted">Development / browser mode</span>
          )}
        </div>
      </header>

      <main className="start-content">
        <section className="start-intro" aria-labelledby="start-heading">
          <div>
            <h1 id="start-heading">Edit video like<br className="start-title-break" /> a document.</h1>
            <p className="start-intro-copy">
              Turn a recording into an editable transcript, then cut a full video or pull out clips.
            </p>
          </div>
          <TranscriptExample />
        </section>

        <section aria-label="Start a new edit">
          <div className="start-workflows">
            <StartWorkflowButton
              icon={<Clapperboard className="h-5 w-5" aria-hidden="true" />}
              title="Edit a Video"
              detail="Cut and refine a full recording from its transcript."
              onClick={() => void onOpenWorkflow('full-video')}
              disabled={workflowPending}
            />
            <StartWorkflowButton
              icon={<Smartphone className="h-5 w-5" aria-hidden="true" />}
              title="Create Clips"
              detail="Find moments and prepare clips for social video."
              onClick={() => void onOpenWorkflow('short')}
              disabled={workflowPending}
            />
          </div>
          {isElectron && (
            <div className="mt-2 flex flex-wrap items-center gap-x-2">
              <button
                type="button"
                onClick={() => void onOpenSample()}
                disabled={workflowPending}
                className="start-utility-button"
              >
                <BookOpen className="h-4 w-4" aria-hidden="true" />
                {isOpeningSample ? 'Opening sample…' : 'Try sample project'}
              </button>
              <span className="text-xs text-editor-text-muted">Practice with a recording and its transcript.</span>
            </div>
          )}
          {!isElectron && (
            <>
              <div
                onDragOver={(event) => event.preventDefault()}
                onDrop={onBrowserDrop}
                className="start-dropzone"
              >
                <ArrowDownToLine className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0">
                  {isBrowserUploading
                    ? 'Uploading ' + (browserUploadName || 'media') + '…'
                    : 'Drop a video or audio file here to start a full edit.'}
                </span>
              </div>
              {browserUploadError && (
                <CreatorNotice className="mt-3" notice={getCreatorErrorPresentation('media-upload', browserUploadError)} />
              )}
              <p className="mt-2 text-xs leading-5 text-editor-text-muted">
                Use the desktop app for native file access, autosave and direct exports.
              </p>
            </>
          )}
        </section>

        {isElectron && (
          <section className="start-projects" aria-labelledby="resume-work-heading">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="resume-work-heading" className="text-base font-semibold text-editor-text">Recent projects</h2>
              <button
                type="button"
                onClick={() => void onLoadProject()}
                disabled={workflowPending}
                className="start-utility-button start-open-project"
              >
                <FileInput className="h-4 w-4" aria-hidden="true" />
                Open Project
              </button>
            </div>
            {!recoveryCandidate && !recoveryError && recentProjects.length === 0 && (
              <p className="mt-2 text-sm text-editor-text-muted">Projects you save or open will appear here.</p>
            )}
            {recoveryCandidate && (
              <div className="mt-3 rounded-lg border border-editor-warning/30 bg-editor-warning/10 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-editor-warning" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-editor-text">Recover your last session</div>
                    <div className="mt-1 truncate text-[11px] text-editor-text-muted" title={recoveryCandidate.videoPath}>
                      {recoveryCandidate.videoPath.split(/[\\/]/).pop()} · Autosaved {new Date(recoveryCandidate.modifiedAt).toLocaleString()}
                    </div>
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

            {recoveryError && <CreatorNotice className="mt-3" notice={getCreatorErrorPresentation('recovery', recoveryError)} />}
            {recentProjects.length > 0 && (
              <div className="mt-2">
                {recentProjects.map((project) => (
                  <button
                    type="button"
                    key={project.path}
                    onClick={() => void onOpenRecentProject(project)}
                    className="start-project-row"
                    title={project.path}
                  >
                    <FileInput className="h-4 w-4 shrink-0 text-editor-text-muted" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-editor-text">{project.videoPath.split(/[\\/]/).pop()}</span>
                      <span className="mt-0.5 block truncate text-xs text-editor-text-muted">
                        {project.source === 'autosave' ? 'Recovered snapshot' : 'Saved project'} · {new Date(project.modifiedAt).toLocaleString()}
                      </span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-editor-text-muted" aria-hidden="true" />
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        <div className="start-setup">
          <SetupStatusCard
            readiness={readiness}
            checks={systemChecks?.checks}
            backendStartupError={backendStartupError}
            systemChecksError={systemChecksError}
            detailsOpen={setupDetailsOpen}
            setupButtonRef={setupButtonRef}
            onToggleSetup={setupDetailsOpen ? dismissSetupDetails : showSetupDetails}
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
      </main>
    </div>
  );
}

function TranscriptExample() {
  return (
    <figure className="start-example">
      <figcaption>
        <AudioLines className="h-4 w-4 text-editor-accent" aria-hidden="true" />
        <span>Transcript preview<span className="sr-only"> showing a filler word marked for removal</span></span>
        <span className="ml-auto text-editor-text-muted">Example</span>
      </figcaption>
      <div className="start-example-body" aria-hidden="true">
        <div className="start-example-frame">
          <img src="./brand/interview-example.webp" alt="" width={540} height={360} />
          <span>00:08</span>
        </div>
        <div className="start-example-transcript">
          <p><span>00:04</span> I recorded the whole conversation.</p>
          <p className="start-example-active"><span>00:08</span> <s>Um,</s> here’s what stood out.</p>
          <p><span>00:12</span> That part is worth sharing.</p>
        </div>
      </div>
    </figure>
  );
}

function SetupStatusCard({
  readiness,
  checks,
  backendStartupError,
  systemChecksError,
  detailsOpen,
  setupButtonRef,
  onToggleSetup,
}: {
  readiness: CoreReadiness;
  checks?: Record<string, SystemCheck>;
  backendStartupError: string;
  systemChecksError: string;
  detailsOpen: boolean;
  setupButtonRef: RefObject<HTMLButtonElement | null>;
  onToggleSetup: () => void;
}) {
  const blockers = getCoreReadinessBlockers(checks);
  const isBlocked = readiness === 'needs-setup';
  const checkFailed = Boolean(systemChecksError) && readiness !== 'ready' && !isBlocked;
  const title = readiness === 'ready'
    ? 'Ready to edit'
    : isBlocked ? 'Setup needs attention' : checkFailed ? 'Setup check unavailable' : 'Checking setup';
  const detail = backendStartupError
    ? 'ScriptCut couldn’t start its editing service.'
    : blockers.includes('backend') || blockers.includes('python')
      ? 'Local editing needs setup before you can start.'
      : blockers.includes('transcription')
        ? 'Transcription needs setup before you can edit a video.'
        : blockers.includes('ffmpeg')
          ? 'Export needs setup before you can finish a video.'
          : null;
  const StatusIcon = readiness === 'ready' ? CheckCircle : isBlocked || checkFailed ? AlertTriangle : Loader2;

  return (
    <section className="start-setup-status" aria-labelledby="setup-status-heading">
      <div className="flex min-w-0 items-center gap-2.5">
        <StatusIcon
          className={'h-4 w-4 shrink-0 ' + (
            readiness === 'ready' ? 'text-editor-success' : isBlocked || checkFailed ? 'text-editor-warning' : 'motion-safe:animate-spin text-editor-text-muted'
          )}
          aria-hidden="true"
        />
        <div role="status">
          <h2 id="setup-status-heading" className="text-sm font-medium text-editor-text">{title}</h2>
          {detail && <p className="mt-0.5 text-xs text-editor-text-muted">{detail}</p>}
        </div>
      </div>
      <button
        type="button"
        ref={setupButtonRef}
        onClick={onToggleSetup}
        aria-expanded={detailsOpen}
        aria-controls={detailsOpen ? 'setup-details' : undefined}
        className="start-utility-button shrink-0"
      >
        {isBlocked && !detailsOpen ? 'Fix Setup' : 'Setup details'}
        <ChevronDown className={'h-4 w-4 ' + (detailsOpen ? 'rotate-180' : '')} aria-hidden="true" />
      </button>
    </section>
  );
}

export function FirstRunChecklist({
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
  headingRef?: RefObject<HTMLHeadingElement | null>;
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
    <section
      id={headingRef ? 'setup-details' : undefined}
      className={headingRef ? 'rounded-lg border border-editor-border bg-editor-surface p-4 text-left' : undefined}
      aria-labelledby={headingRef ? 'setup-details-heading' : undefined}
    >
      <div className="flex flex-wrap items-start justify-end gap-3">
        {headingRef && (
          <div className="mr-auto">
            <h2 id="setup-details-heading" ref={headingRef} tabIndex={-1} className="text-sm font-semibold text-editor-text">Setup details</h2>
            <p className="mt-1 text-xs leading-5 text-editor-text-muted">
              Review the capabilities needed for editing and export. Optional add-ons can wait.
            </p>
          </div>
        )}
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
            {headingRef ? 'Hide details' : 'Close'}
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
    <details className="start-advanced text-xs text-editor-text-muted">
      <summary className="cursor-pointer text-sm font-medium text-editor-text">
        Advanced transcription <span className="font-normal text-editor-text-muted">({transcriptionEngine === 'auto' ? 'Automatic — Recommended' : 'Manual selection'})</span>
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
      className="start-workflow"
    >
      <span className="start-workflow-icon">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold text-editor-text">{title}</span>
        <span className="mt-1 block text-sm leading-5 text-editor-text-muted">{detail}</span>
      </span>
      <ArrowRight className="start-workflow-arrow h-4 w-4 shrink-0" aria-hidden="true" />
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
