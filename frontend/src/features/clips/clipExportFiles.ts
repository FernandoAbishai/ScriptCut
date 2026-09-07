import type { ClipDraft, Word } from '../../types/project';
import { getClipTranscript } from '../../utils/clipDrafts';
import { formatHookFrameBrief, getSelectedHookFrame } from '../../utils/hookFrames';
import { buildSocialPublishingPack } from '../../utils/socialPublishing';
import { formatClipTime } from './presentation';

export type ClipBatchExportResult = {
  draft: ClipDraft;
  outputPath?: string;
  srtPath?: string;
  warnings?: string[];
  error?: string;
};

export function formatPublishingCopy(draft: ClipDraft, words: Word[]) {
  const transcript = words.map((word) => word.word).join(' ').replace(/\s+/g, ' ').trim();
  const hashtags = (draft.hashtags || [])
    .map((tag) => `#${tag.replace(/^#/, '')}`)
    .join(' ');
  const lines = [
    `Title: ${draft.title}`,
    draft.hook ? `Hook: ${draft.hook}` : '',
    draft.caption ? `Caption: ${draft.caption}` : '',
    draft.description ? `Description: ${draft.description}` : '',
    hashtags ? `Hashtags: ${hashtags}` : '',
    `Timing: ${formatClipTime(draft.startTime)} - ${formatClipTime(draft.endTime)} (${Math.round(draft.endTime - draft.startTime)}s)`,
    `Frame: ${draft.aspectRatio === 'vertical' ? '9:16' : draft.aspectRatio === 'square' ? '1:1' : 'source'}`,
    `Export: ${draft.resolution} ${draft.format.toUpperCase()}${draft.captions && draft.captions !== 'none' ? `, ${draft.captions} captions` : ''}`,
    draft.reframe && draft.aspectRatio !== 'source'
      ? `Reframe: ${Math.round(draft.reframe.x)}% horizontal, ${Math.round(draft.reframe.y)}% vertical`
      : '',
    draft.backgroundRemoval?.enabled
      ? `Background: ${draft.backgroundRemoval.replacement}`
      : '',
    transcript ? `Transcript: ${transcript}` : '',
  ];

  return lines.filter(Boolean).join('\n');
}

function getPathSeparator(filePath: string) {
  return filePath.includes('\\') ? '\\' : '/';
}

export function getPathDirectory(filePath: string) {
  const separator = getPathSeparator(filePath);
  const index = filePath.lastIndexOf(separator);
  return index > 0 ? filePath.slice(0, index) : '';
}

function joinPath(directory: string, filename: string) {
  const separator = getPathSeparator(directory);
  const trimmed = directory.replace(/[\\/]+$/, '');
  if (!trimmed) return filename;
  return `${trimmed}${separator}${filename}`;
}

function safeFileStem(value: string) {
  const stem = value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 42);
  return stem || 'scriptcut_clip';
}

export function buildClipOutputPath(
  directory: string,
  title: string,
  format: ClipDraft['format'],
  id?: string,
) {
  const suffix = id ? `_${safeFileStem(id).slice(-12)}` : `_${Date.now()}`;
  return joinPath(directory, `${safeFileStem(title)}${suffix}.${format}`);
}

function timestampForFilename(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

export function buildClipBatchManifest({
  videoPath,
  results,
  words,
  plannedDraftIds,
  remainingDraftIds,
  stopped,
}: {
  videoPath: string | null;
  results: ClipBatchExportResult[];
  words: Word[];
  plannedDraftIds: string[];
  remainingDraftIds: string[];
  stopped: boolean;
}) {
  return {
    app: 'ScriptCut',
    schema: 'scriptcut.clipBatchManifest.v1',
    generatedAt: new Date().toISOString(),
    videoPath,
    summary: {
      total: results.length,
      exported: results.filter((result) => result.outputPath).length,
      failed: results.filter((result) => result.error).length,
      planned: plannedDraftIds.length,
      processed: results.length,
      remaining: remainingDraftIds.length,
      stopped,
    },
    remainingDraftIds,
    clips: results.map(({ draft, outputPath, srtPath, warnings, error }) => ({
      id: draft.id,
      title: draft.title,
      status: outputPath ? 'exported' : 'failed',
      outputPath,
      srtPath,
      error,
      startTime: draft.startTime,
      endTime: draft.endTime,
      duration: draft.endTime - draft.startTime,
      platform: draft.platform || 'shorts',
      package: {
        hook: draft.hook || '',
        caption: draft.caption || '',
        description: draft.description || '',
        hashtags: draft.hashtags || [],
      },
      socialPublishing: buildSocialPublishingPack(draft).map((item) => ({
        platform: item.platform,
        title: item.title,
        caption: item.caption,
        hashtags: item.hashtags,
        ready: item.ready,
        warnings: item.warnings,
      })),
      hookFrame: {
        label: draft.hookFrameLabel || getSelectedHookFrame(draft).label,
        time: draft.hookFrameTime ?? getSelectedHookFrame(draft).time,
        thumbnailText: draft.thumbnailText || draft.hook || draft.title,
        filename: getSelectedHookFrame(draft).filename,
        brief: formatHookFrameBrief(draft),
      },
      export: {
        format: draft.format,
        resolution: draft.resolution,
        aspectRatio: draft.aspectRatio,
        captions: draft.captions || 'none',
        enhanceAudio: !!draft.enhanceAudio,
      },
      warnings: warnings || [],
      transcript: getClipTranscript(words, draft),
    })),
  };
}

export async function writeClipBatchManifest({
  directory,
  writeManifest,
  ...manifestInput
}: Parameters<typeof buildClipBatchManifest>[0] & {
  directory: string;
  writeManifest?: (filePath: string, content: string) => Promise<boolean>;
}) {
  if (!directory || !writeManifest) return '';
  const manifestPath = joinPath(directory, `scriptcut_clip_manifest_${timestampForFilename()}.json`);
  const manifest = buildClipBatchManifest(manifestInput);
  await writeManifest(manifestPath, JSON.stringify(manifest, null, 2));
  return manifestPath;
}
