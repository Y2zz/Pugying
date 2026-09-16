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

/** 针对单个平台账号的差异字段；封面差异在 Target 的 BLOB 列，不在此 JSON */
export interface ContentTargetOverrides {
  title?: string;
  body?: string;
  tags?: string[];
  scheduledAt?: string;
  visibility?: ContentVisibility;
  allowDownload?: boolean;
}
