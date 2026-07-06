import type { ClipDraft } from '../types/project';

export type SocialPlatform = 'youtube-shorts' | 'tiktok' | 'instagram-reels';

export type SocialPublishingItem = {
  platform: SocialPlatform;
  label: string;
  title: string;
  caption: string;
  hashtags: string[];
  warnings: string[];
  ready: boolean;
  text: string;
};

const PLATFORM_RULES: Record<SocialPlatform, { label: string; titleLimit?: number; captionLimit: number; requiredTag: string }> = {
  'youtube-shorts': { label: 'Shorts', titleLimit: 100, captionLimit: 5000, requiredTag: 'shorts' },
  tiktok: { label: 'TikTok', captionLimit: 2200, requiredTag: 'tiktok' },
  'instagram-reels': { label: 'Reels', captionLimit: 2200, requiredTag: 'reels' },
};

export function normalizeSocialHashtags(tags: string[] = [], requiredTag?: string) {
  const normalized = tags
    .map((tag) => tag.trim().replace(/^#+/, '').replace(/[^\w-]/g, ''))
    .filter(Boolean);
  const next = requiredTag ? [requiredTag, ...normalized] : normalized;
  return Array.from(new Set(next.map((tag) => tag.toLowerCase()))).slice(0, 8);
}

export function buildSocialCaption(draft: Pick<ClipDraft, 'caption' | 'description' | 'hook'>) {
  return (draft.caption || draft.description || draft.hook || '').trim();
}

export function formatSocialPublishingText(item: Pick<SocialPublishingItem, 'label' | 'title' | 'caption' | 'hashtags'>) {
  const hashtags = item.hashtags.map((tag) => `#${tag.replace(/^#/, '')}`).join(' ');
  return [
    `${item.label} Title: ${item.title}`,
    item.caption ? `Caption: ${item.caption}` : '',
    hashtags ? `Hashtags: ${hashtags}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildSocialPublishingPack(draft: ClipDraft): SocialPublishingItem[] {
  return (Object.keys(PLATFORM_RULES) as SocialPlatform[]).map((platform) => {
    const rules = PLATFORM_RULES[platform];
    const title = draft.title.trim();
    const caption = buildSocialCaption(draft);
    const hashtags = normalizeSocialHashtags(draft.hashtags, rules.requiredTag);
    const warnings: string[] = [];

    if (!title) warnings.push('Add a title.');
    if (rules.titleLimit && title.length > rules.titleLimit) {
      warnings.push(`Keep title under ${rules.titleLimit} characters.`);
    }
    if (!caption) warnings.push('Add a social caption or description.');
    if (caption.length > rules.captionLimit) {
      warnings.push(`Keep caption under ${rules.captionLimit} characters.`);
    }
    if (hashtags.length < 2) warnings.push('Add at least one topical hashtag.');

    const item = {
      platform,
      label: rules.label,
      title,
      caption,
      hashtags,
      warnings,
      ready: warnings.length === 0,
      text: '',
    };

    return {
      ...item,
      text: formatSocialPublishingText(item),
    };
  });
}
