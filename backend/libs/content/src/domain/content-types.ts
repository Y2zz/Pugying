export const CONTENT_TYPES = ['article', 'video'] as const;

/** 图文 / 视频 */
export type ContentType = (typeof CONTENT_TYPES)[number];

export const CONTENT_STATUSES = ['draft', 'published'] as const;

/** 草稿 / 已发布（内容级；分发成败看 Target.publishStatus） */
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const TARGET_PUBLISH_STATUSES = [
  'idle',
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
] as const;

/** 单个分发目标的发布运行态 */
export type TargetPublishStatus = (typeof TARGET_PUBLISH_STATUSES)[number];

export const MEDIA_ASSET_KINDS = [
  'video',
  'cover',
  'cover_landscape',
] as const;

/** 团队库视频 / 竖封面 / 横封面 */
export type MediaAssetKind = (typeof MEDIA_ASSET_KINDS)[number];

export const CONTENT_VISIBILITIES = ['public', 'friends', 'private'] as const;

/** 公开 / 好友可见 / 仅自己可见（参考抖音「谁可以看」） */
export type ContentVisibility = (typeof CONTENT_VISIBILITIES)[number];

export function isContentType(value: string): value is ContentType {
  return (CONTENT_TYPES as readonly string[]).includes(value);
}

export function isContentStatus(value: string): value is ContentStatus {
  return (CONTENT_STATUSES as readonly string[]).includes(value);
}

export function isContentVisibility(
  value: string,
): value is ContentVisibility {
  return (CONTENT_VISIBILITIES as readonly string[]).includes(value);
}

export function isTargetPublishStatus(
  value: string,
): value is TargetPublishStatus {
  return (TARGET_PUBLISH_STATUSES as readonly string[]).includes(value);
}

export function isMediaAssetKind(value: string): value is MediaAssetKind {
  return (MEDIA_ASSET_KINDS as readonly string[]).includes(value);
}

/** 针对单个平台账号的差异字段；未设置的字段回落到内容通用设置 */
export interface ContentTargetOverrides {
  title?: string;
  body?: string;
  coverUrl?: string;
  tags?: string[];
  scheduledAt?: string;
}
