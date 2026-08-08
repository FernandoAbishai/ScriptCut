export type CoreReadiness = 'checking' | 'ready' | 'needs-setup';

export type ReadinessCheck = {
  ok: boolean;
};

export const CORE_READINESS_CHECKS = ['backend', 'python', 'transcription', 'ffmpeg'] as const;
export const OPTIONAL_READINESS_CHECKS = ['background', 'audio', 'captions'] as const;

export type CoreReadinessCheck = (typeof CORE_READINESS_CHECKS)[number];

export function getCoreReadiness(
  checks: Record<string, ReadinessCheck> | undefined,
  options: { backendStartupError?: string; isChecking?: boolean } = {},
): CoreReadiness {
  if (options.backendStartupError?.trim()) return 'needs-setup';
  if (options.isChecking || !checks) return 'checking';

  const coreChecks = CORE_READINESS_CHECKS.map((key) => checks[key]);
  if (coreChecks.some((check) => !check)) return 'checking';
  return coreChecks.some((check) => !check.ok) ? 'needs-setup' : 'ready';
}

export function getCoreReadinessBlockers(
  checks: Record<string, ReadinessCheck> | undefined,
): CoreReadinessCheck[] {
  if (!checks) return [];
  return CORE_READINESS_CHECKS.filter((key) => checks[key] && !checks[key].ok);
}
