import type { ContentVisibility, CoverKind, PlatformId } from '@/lib/api';
import { ARTICLE_SUPPORTED_PLATFORMS as ARTICLE_PLATFORM_IDS } from '@/lib/platforms';

/** 与 lib/platforms 同源，便于文章页就近引用 */
export const ARTICLE_SUPPORTED_PLATFORMS = ARTICLE_PLATFORM_IDS;

export type ArticleCoverMode = 'portrait_3_4' | 'landscape_4_3' | 'optional';

export interface ArticlePlatformFieldSpec {
  platformId: PlatformId;
  titleMax: number;
  titleRequired: boolean;
  bodyPlainMin: number;
  bodyPlainMax: number;
  cover: {
    mode: ArticleCoverMode;
    required: boolean;
    allowFromFirstImage: boolean;
  };
  secondaryCover: 'portrait_3_4' | 'landscape_4_3' | null;
  tags: { enabled: boolean; maxCount: number };
  visibility: ContentVisibility[] | null;
  schedule: { enabled: boolean; minHours: number; maxDays: number } | null;
  location: { enabled: boolean };
  partition: { enabled: boolean; label: string };
}

const DOUYIN_VISIBILITY: ContentVisibility[] = ['public', 'friends', 'private'];

/**
 * 文章平台字段规格：富文本内嵌图 + 独立信息流封面。
 * 数字随真实创作者侧接口可再微调。
 */
export const ARTICLE_PLATFORM_FIELDS: {
  [K in (typeof ARTICLE_SUPPORTED_PLATFORMS)[number]]: ArticlePlatformFieldSpec;
} = {
  douyin: {
    platformId: 'douyin',
    titleMax: 30,
    titleRequired: true,
    bodyPlainMin: 200,
    bodyPlainMax: 50_000,
    cover: { mode: 'landscape_4_3', required: true, allowFromFirstImage: true },
    secondaryCover: null,
    tags: { enabled: true, maxCount: 5 },
    visibility: DOUYIN_VISIBILITY,
    schedule: { enabled: true, minHours: 2, maxDays: 14 },
    location: { enabled: false },
    partition: { enabled: false, label: '' },
  },
  toutiao: {
    platformId: 'toutiao',
    titleMax: 64,
    titleRequired: true,
    bodyPlainMin: 200,
    bodyPlainMax: 50_000,
    cover: { mode: 'landscape_4_3', required: true, allowFromFirstImage: true },
    secondaryCover: null,
    tags: { enabled: true, maxCount: 10 },
    visibility: null,
    schedule: { enabled: true, minHours: 2, maxDays: 14 },
    location: { enabled: false },
    partition: { enabled: false, label: '' },
  },
  bilibili: {
    platformId: 'bilibili',
    titleMax: 80,
    titleRequired: true,
    bodyPlainMin: 1,
    bodyPlainMax: 50_000,
    cover: { mode: 'landscape_4_3', required: true, allowFromFirstImage: true },
    secondaryCover: null,
    tags: { enabled: true, maxCount: 10 },
    visibility: null,
    schedule: { enabled: true, minHours: 2, maxDays: 15 },
    location: { enabled: false },
    partition: { enabled: true, label: '分区' },
  },
};

export function isArticleSupportedPlatform(
  id: string,
): id is (typeof ARTICLE_SUPPORTED_PLATFORMS)[number] {
  return (ARTICLE_SUPPORTED_PLATFORMS as readonly string[]).includes(id);
}

export function getArticlePlatformFields(platform: PlatformId): ArticlePlatformFieldSpec {
  if (!isArticleSupportedPlatform(platform)) {
    throw new Error(`Platform ${platform} is not an article platform`);
  }
  return ARTICLE_PLATFORM_FIELDS[platform];
}

/** 平台会用到的封面比例 */
export function articleCoverAspects(platform: PlatformId): CoverKind[] {
  const spec = getArticlePlatformFields(platform);
  const aspects: CoverKind[] = [];
  if (spec.cover.mode === 'portrait_3_4' || spec.secondaryCover === 'portrait_3_4') {
    aspects.push('portrait');
  }
  if (spec.cover.mode === 'landscape_4_3' || spec.secondaryCover === 'landscape_4_3') {
    aspects.push('landscape');
  }
  return aspects;
}

export function isArticleCoverRequired(platform: PlatformId, aspect: CoverKind): boolean {
  const spec = getArticlePlatformFields(platform);
  if (!spec.cover.required) {
    return false;
  }
  return aspect === 'portrait'
    ? spec.cover.mode === 'portrait_3_4'
    : spec.cover.mode === 'landscape_4_3';
}

/** 主内容标题上限：取所选平台中最严（最小 max） */
export function intersectArticleTitleMax(platforms: PlatformId[]): number {
  if (platforms.length === 0) {
    return Math.max(...ARTICLE_SUPPORTED_PLATFORMS.map((p) => ARTICLE_PLATFORM_FIELDS[p].titleMax));
  }
  return Math.min(...platforms.map((p) => getArticlePlatformFields(p).titleMax));
}

/** 正文纯文字约束：取所选平台最严交集；未选平台时只要求非空 */
export function intersectArticleBodyLimits(platforms: PlatformId[]): {
  min: number;
  max: number;
} {
  if (platforms.length === 0) {
    return {
      min: 1,
      max: Math.max(...ARTICLE_SUPPORTED_PLATFORMS.map((p) => ARTICLE_PLATFORM_FIELDS[p].bodyPlainMax)),
    };
  }
  return {
    min: Math.max(...platforms.map((p) => getArticlePlatformFields(p).bodyPlainMin)),
    max: Math.min(...platforms.map((p) => getArticlePlatformFields(p).bodyPlainMax)),
  };
}

export interface ArticleBulkCapabilities {
  titleMax: number;
  tags: { maxCount: number } | null;
  visibility: ContentVisibility[] | null;
  schedule: { minHours: number; maxDays: number } | null;
  location: boolean;
  partition: { label: string } | null;
}

/** 批量设置：只开放所选账号平台共同支持的字段，数值取最严 */
export function intersectBulkCapabilities(platforms: PlatformId[]): ArticleBulkCapabilities {
  const specs = platforms.map((p) => getArticlePlatformFields(p));
  if (specs.length === 0) {
    return {
      titleMax: 0,
      tags: null,
      visibility: null,
      schedule: null,
      location: false,
      partition: null,
    };
  }
  const titleMax = Math.min(...specs.map((s) => s.titleMax));
  const tags = specs.every((s) => s.tags.enabled)
    ? { maxCount: Math.min(...specs.map((s) => s.tags.maxCount)) }
    : null;
  let visibility: ContentVisibility[] | null = null;
  if (specs.every((s) => s.visibility && s.visibility.length > 0)) {
    const shared = DOUYIN_VISIBILITY.filter((v) => specs.every((s) => s.visibility?.includes(v)));
    visibility = shared.length > 0 ? shared : null;
  }
  const schedule = specs.every((s) => s.schedule?.enabled)
    ? {
        minHours: Math.max(...specs.map((s) => s.schedule!.minHours)),
        maxDays: Math.min(...specs.map((s) => s.schedule!.maxDays)),
      }
    : null;
  const location = specs.every((s) => s.location.enabled);
  const partition = specs.every((s) => s.partition.enabled)
    ? { label: specs[0].partition.label || '分区' }
    : null;
  return { titleMax, tags, visibility, schedule, location, partition };
}

/** 账号级定时校验（按该平台窗口） */
export function validateArticleSchedule(
  iso: string,
  schedule: { minHours: number; maxDays: number },
): string | null {
  const time = new Date(iso).getTime();
  const now = Date.now();
  if (time < now + schedule.minHours * 60 * 60 * 1000) {
    return `需在 ${schedule.minHours} 小时之后`;
  }
  if (time > now + schedule.maxDays * 24 * 60 * 60 * 1000) {
    return `不能晚于 ${schedule.maxDays} 天后`;
  }
  return null;
}
