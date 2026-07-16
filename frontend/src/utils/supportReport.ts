export type SupportJobLog = {
  time?: string;
  message?: string;
};

export type SupportJob = {
  kind?: string;
  attempt?: number;
  status?: string;
  progress?: number;
  message?: string;
  error?: string;
  updatedAt?: string;
  logs?: SupportJobLog[];
};

export type SupportReportInput = {
  app?: {
    version?: string;
    platform?: string;
    arch?: string;
    packaged?: boolean;
    electron?: string;
  };
  runtime?: {
    backend?: { status?: string };
    python?: string;
    platform?: { system?: string; release?: string; machine?: string };
    ffmpeg?: { available?: boolean; version?: string; assSubtitles?: boolean; captionFallback?: string };
  };
  jobs?: SupportJob[];
  fallbackVersion: string;
};

export function redactSupportText(value: unknown) {
  return String(value || '')
    .replace(/\b(sk-[A-Za-z0-9_-]{8,}|sk-ant-[A-Za-z0-9_-]{8,})\b/g, '<redacted-key>')
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~-]+/gi, '$1<redacted>')
    .replace(/\b(api[_ -]?key|token|authorization|password|secret)\s*[:=]\s*[^\s,;]+/gi, '$1=<redacted>')
    .replace(/(?:[A-Za-z]:\\|\\\\[^\\\s]+\\|\/(?:Users|home|private|var)\/)[^\s"']+/g, '<local-path>');
}

function displayTime(value?: string) {
  if (!value) return 'unknown time';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? redactSupportText(value) : date.toISOString();
}

function formatJob(job: SupportJob) {
  const lines = [
    `- ${redactSupportText(job.kind || 'job')} | ${redactSupportText(job.status || 'unknown')} | ${Math.round(Number(job.progress) || 0)}% | ${displayTime(job.updatedAt)}`,
  ];
  if (job.message) lines.push(`  - ${redactSupportText(job.message)}`);
  if (job.error && job.error !== job.message) lines.push(`  - Error: ${redactSupportText(job.error)}`);
  for (const log of (job.logs || []).slice(-6)) {
    lines.push(`  - ${displayTime(log.time)}: ${redactSupportText(log.message)}`);
  }
  return lines.join('\n');
}

export function buildSupportReport({ app, runtime, jobs = [], fallbackVersion }: SupportReportInput) {
  const appVersion = app?.version || fallbackVersion;
  const runtimePlatform = runtime?.platform;
  const ffmpeg = runtime?.ffmpeg;
  const lines = [
    '## ScriptCut Support Report',
    '',
    `- App version: ${redactSupportText(appVersion)}`,
    `- App mode: ${app?.packaged ? 'desktop release' : app ? 'desktop development' : 'browser'}`,
    `- App platform: ${redactSupportText([app?.platform, app?.arch].filter(Boolean).join(' / ') || 'unknown')}`,
    `- Electron: ${redactSupportText(app?.electron || 'not available')}`,
    `- Backend: ${redactSupportText(runtime?.backend?.status || 'not available')}`,
    `- Python: ${redactSupportText(runtime?.python || 'not available')}`,
    `- Runtime platform: ${redactSupportText([runtimePlatform?.system, runtimePlatform?.release, runtimePlatform?.machine].filter(Boolean).join(' / ') || 'not available')}`,
    `- FFmpeg: ${ffmpeg?.available ? redactSupportText(ffmpeg.version || 'available') : 'not available'}`,
    `- Caption delivery: ${ffmpeg?.captionFallback === 'burn-in' ? 'burned into video' : ffmpeg?.captionFallback === 'sidecar-srt' ? 'video + SRT sidecar' : 'not available'}`,
    '',
    '### Recent export jobs',
    jobs.length > 0 ? jobs.map(formatJob).join('\n') : '- No recent export jobs were retained.',
    '',
    '_This report redacts local paths and credential-like values. Add the steps that caused the problem and a screenshot if useful._',
  ];
  return lines.join('\n');
}
