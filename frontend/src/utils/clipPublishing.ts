import type { ClipDraft } from '../types/project';

export type ClipPublishingField = 'title' | 'hook' | 'description' | 'caption' | 'hashtags';

export type ClipPublishingCopy = {
  hook?: string;
  titles?: string[];
  description?: string;
  caption?: string;
  hashtags?: string[];
};

export type ClipPublishingCopyState = {
  ready: boolean;
  presentFields: ClipPublishingField[];
  missingFields: ClipPublishingField[];
};

const PUBLISHING_FIELDS: ClipPublishingField[] = ['title', 'hook', 'description', 'caption', 'hashtags'];

export function normalizeClipPublishingCopy(value: unknown): ClipPublishingCopy | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const normalized: ClipPublishingCopy = {};

  const hook = normalizeText(candidate.hook);
  if (hook) normalized.hook = hook;

  const titles = normalizeStringList(candidate.titles, 3);
  if (titles.length > 0) normalized.titles = titles;

  const description = normalizeText(candidate.description);
  if (description) normalized.description = description;

  const caption = normalizeText(candidate.caption);
  if (caption) normalized.caption = caption;

  const hashtags = normalizeStringList(candidate.hashtags, 8, true);
  if (hashtags.length > 0) normalized.hashtags = hashtags;

  return Object.keys(normalized).length > 0 ? normalized : null;
}

export function normalizeTitleSuggestions(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const suggestions = normalizeStringList(value, 3);
  return suggestions.length > 0 ? suggestions : undefined;
}

export function mergeGeneratedPublishingCopy(
  draft: Pick<ClipDraft, 'hook' | 'description' | 'caption' | 'hashtags' | 'titleSuggestions'>,
  generated: unknown,
): Partial<ClipDraft> | null {
  const copy = normalizeClipPublishingCopy(generated);
  if (!copy) return null;

  const patch: Partial<ClipDraft> = {};
  if (!hasMeaningfulText(draft.hook) && copy.hook) patch.hook = copy.hook;
  if (!hasMeaningfulText(draft.description) && copy.description) patch.description = copy.description;
  if (!hasMeaningfulText(draft.caption) && copy.caption) patch.caption = copy.caption;
  if (!hasMeaningfulList(draft.hashtags) && copy.hashtags) patch.hashtags = copy.hashtags;
  if (copy.titles) patch.titleSuggestions = copy.titles;
  return patch;
}

export function getPublishingCopyState(
  draft: Pick<ClipDraft, 'title' | 'hook' | 'description' | 'caption' | 'hashtags'>,
): ClipPublishingCopyState {
  const values: Record<ClipPublishingField, boolean> = {
    title: hasMeaningfulText(draft.title),
    hook: hasMeaningfulText(draft.hook),
    description: hasMeaningfulText(draft.description),
    caption: hasMeaningfulText(draft.caption),
    hashtags: hasMeaningfulList(draft.hashtags),
  };
  const presentFields = PUBLISHING_FIELDS.filter((field) => values[field]);
  const missingFields = PUBLISHING_FIELDS.filter((field) => !values[field]);
  return {
    ready: missingFields.length === 0,
    presentFields,
    missingFields,
  };
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStringList(value: unknown, limit: number, stripHash = false) {
  const values = typeof value === 'string'
    ? stripHash ? value.replace(/,/g, ' ').split(/\s+/) : [value]
    : Array.isArray(value) ? value : [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of values) {
    if (typeof item !== 'string') continue;
    const normalized = stripHash ? item.trim().replace(/^#+/, '') : item.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
    if (result.length >= limit) break;
  }
  return result;
}

function hasMeaningfulText(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasMeaningfulList(value: unknown) {
  return Array.isArray(value) && value.some((item) => hasMeaningfulText(item));
}
