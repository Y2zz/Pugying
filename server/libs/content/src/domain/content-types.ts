export const CONTENT_TYPES = ['article', 'graphic', 'video'] as const;

/** 文章（富文本）/ 图文（多图+文案）/ 视频 */
export type ContentType = (typeof CONTENT_TYPES)[number];

/**
 * 内容形态可挂的平台（抖音因「发文章」与「图文」分属两边）。
 * 创建 Target 时按 Content.type 校验，禁止跨形态挂错平台。
 */
export const ARTICLE_PLATFORMS = ['toutiao', 'bilibili', 'douyin'] as const;
/** 图文可挂平台（含已接入真实发布的视频号图文） */
export const GRAPHIC_PLATFORMS = [
  'douyin',
  'toutiao',
  'xiaohongshu',
  'channels',
] as const;
/** 短视频可挂平台；与生产队列已接入范围一致，视频号短视频待接入 */
export const VIDEO_PLATFORMS = [
  'douyin',
  'toutiao',
  'bilibili',
  'xiaohongshu',
  'channels',
] as const;

export type ArticlePlatform = (typeof ARTICLE_PLATFORMS)[number];
export type GraphicPlatform = (typeof GRAPHIC_PLATFORMS)[number];
export type VideoPlatform = (typeof VIDEO_PLATFORMS)[number];

export const CONTENT_STATUSES = ['draft', 'published'] as const;

/** 草稿 / 已发布（内容级；分发成败看 Target.publishStatus） */
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const TARGET_PUBLISH_STATUSES = ['idle', 'queued', 'running', 'succeeded', 'failed', 'cancelled'] as const;

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

export function isContentVisibility(value: string): value is ContentVisibility {
  return (CONTENT_VISIBILITIES as readonly string[]).includes(value);
}

export function isTargetPublishStatus(value: string): value is TargetPublishStatus {
  return (TARGET_PUBLISH_STATUSES as readonly string[]).includes(value);
}

/** 某内容类型允许绑定的平台 id 列表 */
export function platformsForContentType(type: ContentType): readonly string[] {
  switch (type) {
    case 'article':
      return ARTICLE_PLATFORMS;
    case 'graphic':
      return GRAPHIC_PLATFORMS;
    case 'video':
      return VIDEO_PLATFORMS;
  }
}

export function isPlatformAllowedForContentType(type: ContentType, platform: string): boolean {
  return platformsForContentType(type).includes(platform);
}

/** 针对单个平台账号的差异字段；封面差异在 Target 的 BLOB 列，不在此 JSON */
export interface ContentTargetOverrides {
  title?: string;
  body?: string;
  tags?: string[];
  /** 平台话题资源（含标识）；有值时优先于纯文本 tags */
  topicRefs?: import('./platform-resource').PlatformResourceRef[];
  /** B 站文章文集（含标识） */
  anthologyRef?: import('./platform-resource').PlatformResourceRef;
  /** 抖音视频合集（含标识） */
  collectionRef?: import('./platform-resource').PlatformResourceRef;
  scheduledAt?: string;
  visibility?: ContentVisibility;
  allowDownload?: boolean;
  articleSettings?: import('./article-settings').ArticleAccountSettings;
  bilibiliVideoSettings?: import('./bilibili-video-settings').BilibiliVideoSettings;
  authorDeclaration?: import('./author-declaration').AuthorDeclaration;
  /** 地点（如小红书图文） */
  location?: string;
  /** 分区等无稳定枚举的扩展文案（如哔哩哔哩） */
  partition?: string;
}
