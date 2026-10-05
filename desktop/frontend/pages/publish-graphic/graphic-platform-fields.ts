import type { ContentVisibility, CoverKind, PlatformId } from '@/lib/api';
import { GRAPHIC_SUPPORTED_PLATFORMS as GRAPHIC_PLATFORM_IDS } from '@/lib/platforms';

/** 与 lib/platforms 同源 */
export const GRAPHIC_SUPPORTED_PLATFORMS = GRAPHIC_PLATFORM_IDS;

export type GraphicCoverMode = 'portrait_3_4' | 'landscape_4_3' | 'optional' | 'from_images';

export interface GraphicPlatformFieldSpec {
  platformId: PlatformId;
  titleMax: number;
  titleRequired: boolean;
  bodyPlainMin: number;
  bodyPlainMax: number;
  cover: {
    mode: GraphicCoverMode;
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
const GRAPHIC_VISIBILITY: ContentVisibility[] = ['public', 'private'];

/**
 * 图文平台字段规格：多图轮播 + 文案分离。
 */
export const GRAPHIC_PLATFORM_FIELDS: {
  [K in (typeof GRAPHIC_SUPPORTED_PLATFORMS)[number]]: GraphicPlatformFieldSpec;
} = {
  douyin: {
    platformId: 'douyin',
    titleMax: 20,
    titleRequired: true,
    bodyPlainMin: 1,
    bodyPlainMax: 1000,
    cover: { mode: 'portrait_3_4', required: true, allowFromFirstImage: true },
    secondaryCover: null,
    tags: { enabled: true, maxCount: 5 },
    visibility: DOUYIN_VISIBILITY,
    schedule: { enabled: true, minHours: 2, maxDays: 14 },
    location: { enabled: false },
    partition: { enabled: false, label: '' },
  },
  channels: {
    platformId: 'channels',
    titleMax: 30,
    titleRequired: false,
    bodyPlainMin: 1,
    bodyPlainMax: 1000,
    cover: { mode: 'from_images', required: false, allowFromFirstImage: true },
    secondaryCover: 'portrait_3_4',
    tags: { enabled: true, maxCount: 10 },
    visibility: GRAPHIC_VISIBILITY,
    schedule: { enabled: true, minHours: 1, maxDays: 14 },
    location: { enabled: false },
    partition: { enabled: false, label: '' },
  },
  xiaohongshu: {
    platformId: 'xiaohongshu',
    titleMax: 20,
    titleRequired: true,
    bodyPlainMin: 1,
    bodyPlainMax: 1000,
    cover: { mode: 'portrait_3_4', required: true, allowFromFirstImage: true },
    secondaryCover: null,
    tags: { enabled: true, maxCount: 10 },
    visibility: GRAPHIC_VISIBILITY,
    schedule: { enabled: true, minHours: 1, maxDays: 14 },
    location: { enabled: true },
    partition: { enabled: false, label: '' },
  },
};

export function isGraphicSupportedPlatform(
  id: string,
): id is (typeof GRAPHIC_SUPPORTED_PLATFORMS)[number] {
  return (GRAPHIC_SUPPORTED_PLATFORMS as readonly string[]).includes(id);
}

export function getGraphicPlatformFields(platform: PlatformId): GraphicPlatformFieldSpec {
  if (!isGraphicSupportedPlatform(platform)) {
    throw new Error(`Platform ${platform} is not a graphic platform`);
  }
  return GRAPHIC_PLATFORM_FIELDS[platform];
}

export function graphicCoverAspects(platform: PlatformId): CoverKind[] {
  const spec = getGraphicPlatformFields(platform);
  const aspects: CoverKind[] = [];
  if (
    spec.cover.mode === 'portrait_3_4' ||
    spec.cover.mode === 'from_images' ||
    spec.secondaryCover === 'portrait_3_4'
  ) {
    aspects.push('portrait');
  }
  if (spec.cover.mode === 'landscape_4_3' || spec.secondaryCover === 'landscape_4_3') {
    aspects.push('landscape');
  }
  return aspects;
}

export function isGraphicCoverRequired(platform: PlatformId, aspect: CoverKind): boolean {
  const spec = getGraphicPlatformFields(platform);
  if (!spec.cover.required) {
    return false;
  }
  return aspect === 'portrait'
    ? spec.cover.mode === 'portrait_3_4'
    : spec.cover.mode === 'landscape_4_3';
}

export function intersectGraphicTitleMax(platforms: PlatformId[]): number {
  if (platforms.length === 0) {
    return Math.max(...GRAPHIC_SUPPORTED_PLATFORMS.map((p) => GRAPHIC_PLATFORM_FIELDS[p].titleMax));
  }
  return Math.min(...platforms.map((p) => getGraphicPlatformFields(p).titleMax));
}

export function intersectGraphicBodyLimits(platforms: PlatformId[]): {
  min: number;
  max: number;
} {
  if (platforms.length === 0) {
    return {
      min: 1,
      max: Math.max(...GRAPHIC_SUPPORTED_PLATFORMS.map((p) => GRAPHIC_PLATFORM_FIELDS[p].bodyPlainMax)),
    };
  }
  return {
    min: Math.max(...platforms.map((p) => getGraphicPlatformFields(p).bodyPlainMin)),
    max: Math.min(...platforms.map((p) => getGraphicPlatformFields(p).bodyPlainMax)),
  };
}

export interface GraphicBulkCapabilities {
  titleMax: number;
  tags: { maxCount: number } | null;
  visibility: ContentVisibility[] | null;
  schedule: { minHours: number; maxDays: number } | null;
  location: boolean;
  partition: { label: string } | null;
}

export function intersectGraphicBulkCapabilities(platforms: PlatformId[]): GraphicBulkCapabilities {
  const specs = platforms.map((p) => getGraphicPlatformFields(p));
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

export function validateGraphicSchedule(
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
