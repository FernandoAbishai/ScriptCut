import { useState } from 'react';
import { Sparkles, Loader2, Check, X, Play, Download, RotateCcw, Plus, Image, Clipboard, ExternalLink } from 'lucide-react';
import type { CaptionStyle, ClipDraft, ClipDraftStatus, Word } from '../../types/project';
import type { ClipDraftExportValidation, ClipDraftReadinessScore } from '../../utils/clipDrafts';
import { getPublishingCopyState } from '../../utils/clipPublishing';
import { buildSocialPublishingPack, type SocialPlatform } from '../../utils/socialPublishing';
import { buildHookFrameCandidates, getSelectedHookFrame, type HookFrameCandidate } from '../../utils/hookFrames';
import { buildBackendFileUrl } from '../../utils/backendFile';
import CaptionPreview from '../../components/CaptionPreview';
import { CLIP_CAPTION_PRESETS, formatClipTime } from './presentation';
import type { BackgroundCapabilities, ClipExportOutput, ExportJob } from './types';

export default function ClipDraftCard({
  draft,
  isExporting,
  exportBusy,
  isGeneratingPublishingCopy,
  exportJob,
  exportResult,
  backendUrl,
  backgroundCapabilities,
  transcriptSnippet,
  clipWords,
  activeWordIndex,
  isActive,
  exportValidation,
  readinessScore,
  onChange,
  onTrim,
  onApprove,
  onPrepare,
  onPreview,
  onExport,
  onCancelExport,
  onRetryExport,
  onGeneratePublishingCopy,
  onCopyPublishingCopy,
  onCopySocialPackage,
  onPreviewHookFrame,
  onCopyHookFrame,
  onDuplicate,
  onRemove,
}: {
  draft: ClipDraft;
  isExporting: boolean;
  exportBusy: boolean;
  isGeneratingPublishingCopy: boolean;
  exportJob?: ExportJob;
  exportResult?: ClipExportOutput;
  backendUrl: string;
  backgroundCapabilities: BackgroundCapabilities | null;
  transcriptSnippet: string;
  clipWords: Word[];
  activeWordIndex: number;
  isActive: boolean;
  exportValidation: ClipDraftExportValidation;
  readinessScore: ClipDraftReadinessScore;
  onChange: (patch: Partial<ClipDraft>) => void;
  onTrim: (patch: Pick<Partial<ClipDraft>, 'startTime' | 'endTime'>) => void;
  onApprove: () => void;
  onPrepare: () => void;
  onPreview: () => void;
  onExport: () => void;
  onCancelExport: () => void;
  onRetryExport: () => void;
  onGeneratePublishingCopy: () => void;
  onCopyPublishingCopy: () => void;
  onCopySocialPackage: (platform?: SocialPlatform) => void;
  onPreviewHookFrame: (time: number) => void;
  onCopyHookFrame: (frame?: HookFrameCandidate) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const [advancedExportOpen, setAdvancedExportOpen] = useState(false);
  const [publishingCopyOpen, setPublishingCopyOpen] = useState(false);
  const status = draft.status || 'draft';
  const exportJobCancelable = exportJob?.status === 'queued' || exportJob?.status === 'running';
  const exportActive =
    isExporting ||
    status === 'exporting' ||
    exportJobCancelable ||
    exportJob?.status === 'canceling';
  const exportRetryable = status === 'failed';
  const isSuggested = status === 'suggested';
  const canPrepare = status === 'draft' && exportValidation.ready;
  const canExport = exportValidation.ready && status === 'packaged';
  const socialPack = buildSocialPublishingPack(draft);
  const publishingCopyState = getPublishingCopyState(draft);
  const hasGeneratedPublishingCopy = Boolean(
    draft.hook?.trim() ||
    draft.description?.trim() ||
    draft.caption?.trim() ||
    draft.hashtags?.some((tag) => tag.trim()) ||
    draft.titleSuggestions?.length,
  );
  const hookFrames = buildHookFrameCandidates(draft);
  const selectedHookFrame = getSelectedHookFrame(draft);
  const srtPath = exportResult?.srtPath || draft.srtPath;
  const exportWarnings = exportResult?.warnings || draft.exportWarnings || [];

  return (
    <div className={`space-y-2 rounded border p-3 ${isActive ? 'border-editor-accent bg-editor-accent/5' : 'border-transparent bg-editor-surface'}`}>
      <div className="flex items-start gap-2">
        <input
          value={draft.title}
          onChange={(e) => onChange({ title: e.target.value })}
          className="min-w-0 flex-1 rounded border border-editor-border bg-editor-bg px-2 py-1.5 text-xs font-semibold text-editor-text focus:border-editor-accent focus:outline-none"
        />
        <ClipStatusBadge status={status} />
      </div>
      {publishingCopyOpen && draft.titleSuggestions && draft.titleSuggestions.length > 0 && (
        <div className="space-y-1 rounded bg-editor-bg px-2 py-1.5 text-[10px] text-editor-text-muted">
          <div className="font-medium text-editor-text">Title suggestions</div>
          <div className="flex flex-wrap gap-1">
            {draft.titleSuggestions.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => onChange({ title: suggestion })}
                className="rounded bg-editor-border px-1.5 py-1 text-left text-[10px] text-editor-text-muted hover:bg-editor-surface hover:text-editor-text"
              >
                Use “{suggestion}”
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center justify-between text-[10px] text-editor-text-muted">
        <span>
          {formatClipTime(draft.startTime)} - {formatClipTime(draft.endTime)}
        </span>
        <span>{Math.round(draft.endTime - draft.startTime)}s</span>
      </div>
      <div className="rounded border border-editor-border bg-editor-bg text-[10px] text-editor-text-muted">
        <button
          type="button"
          aria-expanded={publishingCopyOpen}
          aria-controls={`publishing-copy-${draft.id}`}
          onClick={() => setPublishingCopyOpen((current) => !current)}
          className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left hover:bg-editor-surface"
        >
          <span className="font-medium text-editor-text">Publishing copy — optional</span>
          <span className={publishingCopyState.ready ? 'text-editor-success' : 'text-editor-text-muted'}>
            {publishingCopyState.ready ? 'Copy ready' : publishingCopyOpen ? 'Hide' : 'Show'}
          </span>
        </button>
        {publishingCopyOpen && (
          <div id={`publishing-copy-${draft.id}`} className="space-y-2 border-t border-editor-border p-2">
            <div>
              {publishingCopyState.ready
                ? 'Publishing copy is ready, but it is not required to export this clip.'
                : `Optional fields missing: ${publishingCopyState.missingFields.join(', ')}`}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={onGeneratePublishingCopy}
                disabled={isSuggested || isGeneratingPublishingCopy}
                className="flex items-center justify-center gap-1 rounded bg-editor-accent/20 px-2 py-1.5 text-xs text-editor-accent hover:bg-editor-accent/30 disabled:opacity-50"
              >
                {isGeneratingPublishingCopy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                {isGeneratingPublishingCopy ? 'Generating copy...' : hasGeneratedPublishingCopy ? 'Refresh publishing copy' : 'Generate publishing copy'}
              </button>
              <button
                onClick={onCopyPublishingCopy}
                className="flex items-center justify-center gap-1 rounded bg-editor-border px-2 py-1.5 text-xs text-editor-text-muted hover:bg-editor-surface"
              >
                <Clipboard className="w-3 h-3" /> Copy details
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="space-y-1 rounded bg-editor-bg px-2 py-1.5 text-[10px] text-editor-text-muted">
        <div className="flex items-center justify-between gap-2">
          <span>Readiness</span>
          <span className={readinessScore.score >= 85 ? 'text-editor-success' : readinessScore.score >= 65 ? 'text-editor-accent' : 'text-editor-warning'}>
            {readinessScore.label} · {readinessScore.score}%
          </span>
        </div>
        <div className="h-1 overflow-hidden rounded bg-editor-border">
          <div
            className={`h-full ${readinessScore.score >= 85 ? 'bg-editor-success' : readinessScore.score >= 65 ? 'bg-editor-accent' : 'bg-editor-warning'}`}
            style={{ width: `${Math.max(4, readinessScore.score)}%` }}
          />
        </div>
        {readinessScore.reasons.length > 0 && (
          <div className="truncate text-editor-text-muted">{readinessScore.reasons[0]}</div>
        )}
      </div>
      {draft.exportPath && (
        <div className="space-y-2 rounded border border-editor-success/30 bg-editor-success/10 px-2.5 py-2 text-[10px] text-editor-success">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-semibold">Clip ready</div>
              <div className="mt-0.5 truncate text-editor-text" title={draft.title}>{draft.title}</div>
            </div>
            <ClipStatusBadge status="exported" />
          </div>
          <div className="space-y-1 rounded bg-editor-bg px-2 py-1.5">
            <div className="font-medium text-editor-text">Video output</div>
            <div className="truncate" title={draft.exportPath}>{getFileNameFromPath(draft.exportPath, `${draft.title || 'scriptcut_clip'}.${draft.format}`)}</div>
            <div className="flex flex-wrap gap-1">
              {window.electronAPI ? (
                <button
                  onClick={() => window.electronAPI?.revealPath(draft.exportPath || '')}
                  className="inline-flex items-center gap-1 rounded bg-editor-success/20 px-2 py-0.5 text-[10px] text-editor-success hover:bg-editor-success/30"
                >
                  <ExternalLink className="h-3 w-3" />
                  Reveal in Finder
                </button>
              ) : (
                <a
                  href={buildBackendFileUrl(backendUrl, draft.exportPath, exportResult?.fileCapability)}
                  download={getFileNameFromPath(draft.exportPath, `${draft.title || 'scriptcut_clip'}.${draft.format}`)}
                  className="inline-flex rounded bg-editor-success/20 px-2 py-0.5 text-[10px] text-editor-success hover:bg-editor-success/30"
                >
                  Download clip
                </a>
              )}
            </div>
          </div>
          {srtPath && (
            <div className="space-y-1 rounded bg-editor-bg px-2 py-1.5">
              <div className="font-medium text-editor-text">SRT sidecar</div>
              <div className="truncate" title={srtPath}>{getFileNameFromPath(srtPath, 'captions.srt')}</div>
              <div className="flex flex-wrap gap-1">
                {window.electronAPI ? (
                  <button
                    onClick={() => window.electronAPI?.revealPath(srtPath)}
                    className="inline-flex items-center gap-1 rounded bg-editor-success/20 px-2 py-0.5 text-[10px] text-editor-success hover:bg-editor-success/30"
                  >
                    <ExternalLink className="h-3 w-3" /> Reveal SRT in Finder
                  </button>
                ) : (
                  <a
                    href={buildBackendFileUrl(backendUrl, srtPath, exportResult?.srtFileCapability)}
                    download={getFileNameFromPath(srtPath, 'captions.srt')}
                    className="inline-flex rounded bg-editor-success/20 px-2 py-0.5 text-[10px] text-editor-success hover:bg-editor-success/30"
                  >
                    Download SRT
                  </a>
                )}
              </div>
            </div>
          )}
          {exportWarnings.length > 0 && (
            <div className="space-y-0.5 rounded bg-editor-warning/10 px-2 py-1.5 text-editor-warning">
              <div className="font-medium">Export note</div>
              {exportWarnings.map((warning) => <div key={warning}>{warning}</div>)}
            </div>
          )}
        </div>
      )}
      {draft.lastError && (
        <div className="break-words rounded bg-editor-warning/10 px-2 py-1 text-[10px] text-editor-warning">
          {draft.lastError}
        </div>
      )}
      {!canExport && !isSuggested && exportValidation.reasons.length > 0 && (
        <div className="space-y-0.5 rounded bg-editor-warning/10 px-2 py-1 text-[10px] text-editor-warning">
          {exportValidation.reasons.map((reason) => (
            <div key={reason}>{reason}</div>
          ))}
        </div>
      )}
      {(draft.source || draft.speaker) && (
        <div className="flex flex-wrap items-center gap-1 text-[10px]">
          {draft.source && (
            <span className="rounded bg-editor-accent/10 px-1.5 py-0.5 text-editor-accent">
              {draft.source === 'speaker-turn'
                ? 'Speaker turn'
                : draft.source === 'transcript-selection'
                  ? 'Transcript clip'
                  : draft.source === 'ai-director'
                    ? 'AI Director'
                  : 'AI clip'}
            </span>
          )}
          {draft.speaker && (
            <span className="rounded bg-editor-border px-1.5 py-0.5 text-editor-text-muted">
              {draft.speaker}
            </span>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="In"
          value={draft.startTime}
          onChange={(startTime) => onTrim({ startTime: Math.max(0, Math.min(startTime, draft.endTime - 0.25)) })}
        />
        <NumberField
          label="Out"
          value={draft.endTime}
          onChange={(endTime) => onTrim({ endTime: Math.max(draft.startTime + 0.25, endTime) })}
        />
      </div>
      <div className="grid grid-cols-1 gap-2">
        <MiniSelect
          label="Frame"
          value={draft.aspectRatio}
          onChange={(aspectRatio) =>
            onChange({
              aspectRatio: aspectRatio as ClipDraft['aspectRatio'],
              reframe: draft.reframe || { x: 50, y: 50 },
            })
          }
          options={[
            { value: 'source', label: 'Source' },
            { value: 'vertical', label: '9:16' },
            { value: 'square', label: '1:1' },
          ]}
        />
      </div>
      {draft.aspectRatio !== 'source' && (
        <ClipReframeControls
          value={draft.reframe}
          onChange={(reframe) => onChange({ reframe })}
        />
      )}
      <div className="grid grid-cols-2 gap-2">
        <MiniSelect
          label="Captions"
          value={draft.captions || 'none'}
          onChange={(captions) =>
            onChange({
              captions: captions as ClipDraft['captions'],
              captionStyle: draft.captionStyle || CLIP_CAPTION_PRESETS.creator,
            })
          }
          options={[
            { value: 'none', label: 'None' },
            { value: 'burn-in', label: 'Burn-in' },
            { value: 'sidecar', label: 'SRT' },
          ]}
        />
        <MiniSelect
          label="Style"
          value={draft.captionStyle?.preset || 'creator'}
          onChange={(preset) =>
            onChange({
              captions: draft.captions === 'none' ? 'burn-in' : draft.captions,
              captionStyle: CLIP_CAPTION_PRESETS[preset as NonNullable<CaptionStyle['preset']>],
            })
          }
          options={[
            { value: 'clean', label: 'Clean' },
            { value: 'creator', label: 'Creator' },
            { value: 'karaoke', label: 'Karaoke' },
          ]}
        />
      </div>
      {(draft.captions || 'none') === 'burn-in' && (
        <ClipCaptionStyleControls
          value={draft.captionStyle || CLIP_CAPTION_PRESETS.creator}
          onChange={(captionStyle) => onChange({ captionStyle })}
        />
      )}
      <div className="rounded border border-editor-border bg-editor-bg text-[11px] text-editor-text-muted">
        <button
          type="button"
          aria-expanded={advancedExportOpen}
          aria-controls={`advanced-export-settings-${draft.id}`}
          onClick={() => setAdvancedExportOpen((current) => !current)}
          className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left hover:bg-editor-surface"
        >
          <span className="font-medium text-editor-text">Advanced export settings</span>
          <span>{advancedExportOpen ? 'Hide' : 'Show'}</span>
        </button>
        {advancedExportOpen && (
          <div id={`advanced-export-settings-${draft.id}`} className="space-y-2 border-t border-editor-border p-2">
            <div className="grid grid-cols-2 gap-2">
              <MiniSelect
                label="Resolution"
                value={draft.resolution}
                onChange={(resolution) => onChange({ resolution: resolution as ClipDraft['resolution'] })}
                options={[
                  { value: '720p', label: '720p' },
                  { value: '1080p', label: '1080p' },
                  { value: '4k', label: '4K' },
                ]}
              />
              <MiniSelect
                label="Format"
                value={draft.format}
                onChange={(format) => onChange({ format: format as ClipDraft['format'] })}
                options={[
                  { value: 'mp4', label: 'MP4' },
                  { value: 'mov', label: 'MOV' },
                  { value: 'webm', label: 'WebM' },
                ]}
              />
            </div>
            <label className="flex items-center justify-between gap-2 rounded border border-editor-border bg-editor-surface px-2 py-1.5 text-[11px] text-editor-text-muted">
              <span>Enhance audio</span>
              <input
                type="checkbox"
                checked={!!draft.enhanceAudio}
                onChange={(e) => onChange({ enhanceAudio: e.target.checked })}
                className="h-3.5 w-3.5 rounded bg-editor-surface border-editor-border accent-editor-accent"
              />
            </label>
            <ClipBackgroundControls
              draft={draft}
              capabilities={backgroundCapabilities}
              onChange={onChange}
            />
          </div>
        )}
      </div>
      <p className="text-[11px] leading-snug text-editor-text-muted">{draft.reason}</p>
      {(isExporting || exportRetryable) && exportJob && (
        <div className="space-y-1 rounded bg-editor-bg px-2 py-1.5 text-[11px] text-editor-text-muted">
          <div className="flex justify-between gap-2">
            <span className="truncate">{exportJob.message || exportJob.status}</span>
            <span>{Math.round(exportJob.progress || 0)}%</span>
          </div>
          <div className="h-1 overflow-hidden rounded bg-editor-border">
            <div
              className="h-full bg-editor-success"
              style={{ width: `${Math.max(4, Math.min(100, exportJob.progress || 0))}%` }}
            />
          </div>
          {exportJob.error && <div className="break-words text-editor-warning">{exportJob.error}</div>}
        </div>
      )}
      {publishingCopyOpen && (
        <>
      <div className="space-y-1 rounded bg-editor-bg p-2 text-[11px] text-editor-text-muted">
          <div>
            <span className="font-medium text-editor-text">Transcript</span>
            <ClipTranscriptPreview
              words={clipWords}
              startWordIndex={draft.startWordIndex}
              activeWordIndex={isActive ? activeWordIndex : -1}
              fallback={transcriptSnippet || 'No transcript text available for this clip.'}
            />
          </div>
          <EditableText
            label="Hook"
            value={draft.hook || ''}
            placeholder="Opening hook"
            onChange={(hook) => onChange({ hook })}
          />
          <EditableText
            label="Description"
            value={draft.description || ''}
            placeholder="Short description"
            onChange={(description) => onChange({ description })}
          />
          <EditableText
            label="Caption"
            value={draft.caption || ''}
            placeholder="Social caption"
            onChange={(caption) => onChange({ caption })}
          />
          <EditableText
            label="Hashtags"
            value={(draft.hashtags || []).map((tag) => `#${tag.replace(/^#/, '')}`).join(' ')}
            placeholder="#shorts #clip"
            onChange={(value) =>
              onChange({
                hashtags: value
                  .split(/\s+/)
                  .map((tag) => tag.trim().replace(/^#/, ''))
                  .filter(Boolean),
              })
            }
          />
      </div>
      <div className="space-y-2 rounded bg-editor-bg p-2 text-[11px] text-editor-text-muted">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-editor-text">Social Pack</span>
          <button
            onClick={() => onCopySocialPackage()}
            className="rounded bg-editor-border px-2 py-1 text-[10px] text-editor-text-muted hover:bg-editor-surface"
          >
            Copy All
          </button>
        </div>
        <div className="space-y-1">
          {socialPack.map((item) => (
            <div
              key={item.platform}
              className="rounded border border-editor-border bg-editor-surface px-2 py-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-editor-text">{item.label}</span>
                <div className="flex items-center gap-1">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] ${item.ready ? 'bg-editor-success/20 text-editor-success' : 'bg-editor-warning/10 text-editor-warning'}`}>
                    {item.ready ? 'Ready' : 'Needs work'}
                  </span>
                  <button
                    onClick={() => onCopySocialPackage(item.platform)}
                    className="rounded bg-editor-border px-2 py-0.5 text-[10px] text-editor-text-muted hover:bg-editor-bg"
                  >
                    Copy
                  </button>
                </div>
              </div>
              <div className="mt-1 line-clamp-2">{item.caption || 'No caption yet.'}</div>
              <div className="mt-1 truncate text-[10px]">
                {item.hashtags.map((tag) => `#${tag}`).join(' ')}
              </div>
              {item.warnings.length > 0 && (
                <div className="mt-1 space-y-0.5 text-[10px] text-editor-warning">
                  {item.warnings.map((warning) => (
                    <div key={warning}>{warning}</div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-2 rounded bg-editor-bg p-2 text-[11px] text-editor-text-muted">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-editor-text">Hook Frames</span>
          <button
            onClick={() => onCopyHookFrame(selectedHookFrame)}
            className="rounded bg-editor-border px-2 py-1 text-[10px] text-editor-text-muted hover:bg-editor-surface"
          >
            Copy Brief
          </button>
        </div>
        <EditableText
          label="Thumbnail Text"
          value={draft.thumbnailText || draft.hook || ''}
          placeholder="Short overlay text"
          onChange={(thumbnailText) => onChange({ thumbnailText })}
        />
        <div className="grid grid-cols-2 gap-1">
          {hookFrames.map((frame) => {
            const selected = Math.abs(frame.time - selectedHookFrame.time) < 0.05;
            return (
              <div
                key={frame.id}
                className={`rounded border px-2 py-1.5 ${selected ? 'border-editor-accent bg-editor-accent/10' : 'border-editor-border bg-editor-surface'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-editor-text">{frame.label}</span>
                  <span>{formatClipTime(frame.time)}</span>
                </div>
                <div className="mt-1 truncate text-[10px]">{frame.filename}</div>
                {frame.warnings.length > 0 && (
                  <div className="mt-1 text-[10px] text-editor-warning">{frame.warnings[0]}</div>
                )}
                <div className="mt-1 grid grid-cols-3 gap-1">
                  <button
                    onClick={() => onPreviewHookFrame(frame.time)}
                    className="rounded bg-editor-accent/20 px-1.5 py-0.5 text-[10px] text-editor-accent hover:bg-editor-accent/30"
                  >
                    Cue
                  </button>
                  <button
                    onClick={() =>
                      onChange({
                        hookFrameTime: frame.time,
                        hookFrameLabel: frame.label,
                        thumbnailText: frame.overlayText || draft.thumbnailText || draft.hook || draft.title,
                      })
                    }
                    className="rounded bg-editor-border px-1.5 py-0.5 text-[10px] text-editor-text-muted hover:bg-editor-bg"
                  >
                    Set
                  </button>
                  <button
                    onClick={() => onCopyHookFrame(frame)}
                    className="rounded bg-editor-border px-1.5 py-0.5 text-[10px] text-editor-text-muted hover:bg-editor-bg"
                  >
                    Copy
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
        </>
      )}
      <div className="grid grid-cols-2 gap-2">
        {isSuggested ? (
          <button
            onClick={onApprove}
            className="flex items-center justify-center gap-1 rounded bg-editor-success/20 px-2 py-1.5 text-xs text-editor-success hover:bg-editor-success/30"
          >
            <Check className="w-3 h-3" /> Approve
          </button>
        ) : (
          <button
            onClick={onDuplicate}
            className="flex items-center justify-center gap-1 rounded bg-editor-border px-2 py-1.5 text-xs text-editor-text-muted hover:bg-editor-bg"
          >
            <Plus className="w-3 h-3" /> Duplicate
          </button>
        )}
        <button
          onClick={onPreview}
          className="flex items-center justify-center gap-1 rounded bg-editor-accent/20 px-2 py-1.5 text-xs text-editor-accent hover:bg-editor-accent/30"
        >
          <Play className="w-3 h-3" /> Preview
        </button>
        {status === 'draft' ? (
          <button
            onClick={onPrepare}
            disabled={!canPrepare}
            className="flex items-center justify-center gap-1 rounded bg-editor-success/20 px-2 py-1.5 text-xs text-editor-success hover:bg-editor-success/30 disabled:opacity-50"
          >
            <Check className="w-3 h-3" /> Ready for export
          </button>
        ) : status === 'packaged' ? (
          <button
            onClick={onExport}
            disabled={!canExport || exportBusy || isExporting || exportActive}
            className="flex items-center justify-center gap-1 rounded bg-editor-success/20 px-2 py-1.5 text-xs text-editor-success hover:bg-editor-success/30 disabled:opacity-50"
          >
            {isExporting || exportActive ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
            Export
          </button>
        ) : (
          <div className="flex items-center justify-center rounded bg-editor-border px-2 py-1.5 text-xs text-editor-text-muted">
            {status === 'failed' ? 'Retry required' : status === 'exported' ? 'Export complete' : 'Export in progress'}
          </div>
        )}
        {exportActive ? (
          <button
            onClick={onCancelExport}
            disabled={!exportJobCancelable}
            className="flex items-center justify-center gap-1 rounded bg-editor-border px-2 py-1.5 text-xs text-editor-text-muted hover:bg-editor-bg disabled:opacity-50"
          >
            <X className="w-3 h-3" /> {exportJobCancelable ? 'Cancel' : exportJob?.status === 'canceling' || exportJob?.status === 'canceled' ? 'Canceling' : 'Starting'}
          </button>
        ) : exportRetryable ? (
          <button
            onClick={onRetryExport}
            disabled={!exportValidation.ready || exportBusy}
            className="flex items-center justify-center gap-1 rounded bg-editor-accent/20 px-2 py-1.5 text-xs text-editor-accent hover:bg-editor-accent/30 disabled:opacity-50"
          >
            <RotateCcw className="w-3 h-3" /> Retry export
          </button>
        ) : (
          <button
            onClick={onRemove}
            className="flex items-center justify-center gap-1 rounded bg-editor-border px-2 py-1.5 text-xs text-editor-text-muted hover:bg-editor-bg"
          >
            <X className="w-3 h-3" /> {isSuggested ? 'Reject' : 'Remove'}
          </button>
        )}
      </div>
    </div>
  );
}

function EditableText({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] uppercase tracking-wide text-editor-text-muted">{label}</span>
      <textarea
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        rows={label === 'Hook' || label === 'Hashtags' ? 1 : 2}
        className="w-full resize-none rounded border border-editor-border bg-editor-surface px-2 py-1 text-[11px] text-editor-text focus:border-editor-accent focus:outline-none"
      />
    </label>
  );
}

function ClipTranscriptPreview({
  words,
  startWordIndex,
  activeWordIndex,
  fallback,
}: {
  words: Word[];
  startWordIndex: number;
  activeWordIndex: number;
  fallback: string;
}) {
  if (words.length === 0) {
    return <p className="mt-1 line-clamp-3 leading-snug">{fallback}</p>;
  }

  return (
    <p className="mt-1 line-clamp-4 leading-snug">
      {words.map((word, localIndex) => {
        const globalIndex = startWordIndex + localIndex;
        const isActive = globalIndex === activeWordIndex;
        return (
          <span
            key={`${globalIndex}-${word.start}`}
            className={isActive ? 'rounded bg-editor-accent px-0.5 text-white' : undefined}
          >
            {word.word}{' '}
          </span>
        );
      })}
    </p>
  );
}

function ClipBackgroundControls({
  draft,
  capabilities,
  onChange,
}: {
  draft: ClipDraft;
  capabilities: BackgroundCapabilities | null;
  onChange: (patch: Partial<ClipDraft>) => void;
}) {
  const current = draft.backgroundRemoval || { enabled: false, replacement: 'blur' as const, color: '#111827' };
  const available = !!capabilities?.available;
  const update = (patch: Partial<NonNullable<ClipDraft['backgroundRemoval']>>) =>
    onChange({ backgroundRemoval: { ...current, ...patch } });

  const chooseImage = async () => {
    const imagePath = await window.electronAPI?.openFile({
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    });
    if (imagePath) update({ enabled: true, replacement: 'image', imagePath });
  };

  return (
    <div className="space-y-2 rounded border border-editor-border bg-editor-bg p-2">
      <label className="flex items-center justify-between gap-2 text-[11px] text-editor-text-muted">
        <span className="space-y-0.5">
          <span className="block">Remove background</span>
          <span className={`block text-[10px] ${available ? 'text-editor-success' : 'text-editor-warning'}`}>
            {available ? 'Local segmentation ready' : 'Requires MediaPipe + OpenCV'}
          </span>
        </span>
        <input
          type="checkbox"
          checked={current.enabled}
          onChange={(e) => update({ enabled: e.target.checked })}
          className="h-3.5 w-3.5 rounded bg-editor-surface border-editor-border accent-editor-accent"
        />
      </label>
      {current.enabled && (
        <div className="grid grid-cols-2 gap-2">
          <MiniSelect
            label="Replace"
            value={current.replacement}
            onChange={(replacement) =>
              update({ replacement: replacement as NonNullable<ClipDraft['backgroundRemoval']>['replacement'] })
            }
            options={[
              { value: 'blur', label: 'Blur' },
              { value: 'color', label: 'Color' },
              { value: 'image', label: 'Image' },
            ]}
          />
          {current.replacement === 'color' ? (
            <label className="space-y-1">
              <span className="text-[10px] text-editor-text-muted">Color</span>
              <input
                type="color"
                value={current.color}
                onChange={(e) => update({ color: e.target.value })}
                className="h-7 w-full rounded border border-editor-border bg-editor-surface"
              />
            </label>
          ) : (
            <button
              onClick={chooseImage}
              disabled={current.replacement !== 'image'}
              className="mt-4 flex items-center justify-center gap-1 rounded border border-editor-border bg-editor-surface px-2 py-1.5 text-[11px] text-editor-text-muted hover:text-editor-text disabled:opacity-40"
            >
              <Image className="h-3 w-3" />
              {current.imagePath ? 'Change' : 'Image'}
            </button>
          )}
        </div>
      )}
      {current.enabled && current.replacement === 'image' && current.imagePath && (
        <div className="truncate text-[10px] text-editor-text-muted">{current.imagePath}</div>
      )}
      {current.enabled && !available && (
        <div className="rounded bg-editor-warning/10 px-2 py-1 text-[10px] text-editor-warning">
          This draft will fail background removal until the backend has MediaPipe and OpenCV available.
        </div>
      )}
    </div>
  );
}

function ClipCaptionStyleControls({
  value,
  onChange,
}: {
  value: CaptionStyle;
  onChange: (value: CaptionStyle) => void;
}) {
  const update = (patch: Partial<CaptionStyle>) => onChange({ ...value, ...patch, preset: undefined });

  return (
    <div className="space-y-2 rounded border border-editor-border bg-editor-bg p-2">
      <CaptionPreview style={value} />

      <div className="grid grid-cols-2 gap-2">
        <MiniSelect
          label="Position"
          value={value.position}
          onChange={(position) => update({ position: position as CaptionStyle['position'] })}
          options={[
            { value: 'bottom', label: 'Bottom' },
            { value: 'center', label: 'Center' },
            { value: 'top', label: 'Top' },
          ]}
        />
        <MiniSelect
          label="Words"
          value={String(value.wordsPerLine ?? 5)}
          onChange={(wordsPerLine) => update({ wordsPerLine: Number(wordsPerLine) })}
          options={[
            { value: '3', label: '3' },
            { value: '5', label: '5' },
            { value: '8', label: '8' },
            { value: '12', label: '12' },
          ]}
        />
      </div>
      <label className="space-y-1 block">
        <span className="text-[10px] text-editor-text-muted">Font Size</span>
        <input
          type="range"
          min="32"
          max="84"
          value={value.fontSize}
          onChange={(e) => update({ fontSize: Number(e.target.value) })}
          className="w-full accent-editor-accent"
        />
        <span className="block text-[10px] text-editor-text-muted">{value.fontSize}px</span>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <MiniColorField
          label="Text"
          value={value.fontColor}
          onChange={(fontColor) => update({ fontColor })}
        />
        <MiniColorField
          label="Highlight"
          value={value.highlightColor || value.fontColor}
          onChange={(highlightColor) => update({ highlightColor })}
        />
      </div>
      <label className="flex items-center gap-2 text-[11px] text-editor-text-muted">
        <input
          type="checkbox"
          checked={value.bold}
          onChange={(e) => update({ bold: e.target.checked })}
          className="h-3.5 w-3.5 rounded bg-editor-surface border-editor-border accent-editor-accent"
        />
        Bold
      </label>
    </div>
  );
}

function ClipStatusBadge({ status }: { status: ClipDraftStatus }) {
  const classes: Record<ClipDraftStatus, string> = {
    suggested: 'bg-editor-accent/15 text-editor-accent',
    draft: 'bg-editor-border text-editor-text-muted',
    packaged: 'bg-editor-success/20 text-editor-success',
    exporting: 'bg-editor-accent/20 text-editor-accent',
    exported: 'bg-editor-success/20 text-editor-success',
    failed: 'bg-editor-warning/10 text-editor-warning',
  };
  const labels: Record<ClipDraftStatus, string> = {
    suggested: 'Suggested',
    draft: 'Prepare',
    packaged: 'Prepared',
    exporting: 'Exporting',
    exported: 'Exported',
    failed: 'Needs retry',
  };

  return (
    <span className={`shrink-0 rounded px-1.5 py-1 text-[10px] font-medium ${classes[status]}`}>
      {labels[status]}
    </span>
  );
}


function ClipReframeControls({
  value,
  onChange,
}: {
  value: ClipDraft['reframe'];
  onChange: (value: NonNullable<ClipDraft['reframe']>) => void;
}) {
  const current = value || { x: 50, y: 50 };
  const update = (patch: Partial<NonNullable<ClipDraft['reframe']>>) =>
    onChange({ ...current, ...patch });

  return (
    <div className="space-y-2 rounded border border-editor-border bg-editor-bg p-2">
      <ClipRangeField
        label="Horizontal"
        value={current.x}
        leftLabel="Left"
        rightLabel="Right"
        onChange={(x) => update({ x })}
      />
      <ClipRangeField
        label="Vertical"
        value={current.y}
        leftLabel="Top"
        rightLabel="Bottom"
        onChange={(y) => update({ y })}
      />
      <button
        onClick={() => onChange({ x: 50, y: 50 })}
        className="rounded bg-editor-border px-2 py-1 text-[10px] text-editor-text-muted hover:bg-editor-surface"
      >
        Center crop
      </button>
    </div>
  );
}

function ClipRangeField({
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
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-editor-text-muted">{label}</span>
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
      <div className="flex justify-between text-[9px] text-editor-text-muted">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
    </label>
  );
}

function MiniColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="text-[10px] text-editor-text-muted">{label}</span>
      <span className="flex items-center gap-1 rounded border border-editor-border bg-editor-surface px-1.5 py-1">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-5 w-5 shrink-0 border-0 bg-transparent p-0"
        />
        <span className="truncate font-mono text-[10px] text-editor-text-muted uppercase">{value}</span>
      </span>
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="text-[10px] text-editor-text-muted">{label}</span>
      <input
        type="number"
        min="0"
        step="0.1"
        value={Number(value.toFixed(1))}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
        className="w-full rounded border border-editor-border bg-editor-bg px-2 py-1 text-xs text-editor-text focus:border-editor-accent focus:outline-none"
      />
    </label>
  );
}

function MiniSelect({
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
    <label className="space-y-1 min-w-0">
      <span className="text-[10px] text-editor-text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-editor-border bg-editor-bg px-1.5 py-1 text-[11px] text-editor-text focus:border-editor-accent focus:outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}


function getFileNameFromPath(path: string, fallback: string) {
  const normalized = path.replace(/\\/g, '/');
  return normalized.split('/').filter(Boolean).pop() || fallback;
}
