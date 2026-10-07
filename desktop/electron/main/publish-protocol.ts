import type { AgentCookie } from "./protocol";

export type PlatformPublishProgressPhase =
  | "accepted"
  | "fetching_media"
  | "opening_creator"
  | "uploading"
  | "submitting"
  | "done";

/** 与内容实体 type 对齐；缺省按 video，兼容现网短视频载荷 */
export type PlatformPublishContentType = "video" | "article" | "graphic";

export interface PlatformPublishStartPayload {
  requestId: string;
  /** Backend content target UUID for correlation. */
  targetId: string;
  platform: string;
  accountId: string;
  /** 缺省 video，兼容未传字段的旧客户端 */
  contentType?: PlatformPublishContentType;
  /** 本机视频绝对路径（video）；图文/文章可省略，改用 mediaPaths */
  mediaPath?: string;
  /** 图文轮播图 / 文章插图本机绝对路径；视频可省略 */
  mediaPaths?: string[];
  /** 主封面本机临时文件路径；抖音文章为竖版3:4，头条/B站文章为横版 */
  coverPath: string;
  /** 横封面（4:3）本机临时文件路径；图文可不传 */
  coverLandscapePath?: string;
  articleCoverPaths?: string[];
  title: string;
  body?: string;
  tags?: string[];
  topicRefs?: import("../../shared/platform-resource").PlatformResourceRef[];
  articleSettings?: import("../../shared/article-settings").ArticleAccountSettings;
  bilibiliVideoSettings?: import("../../shared/bilibili-video-settings").BilibiliVideoSettings;
  authorDeclaration?: import("../../shared/douyin-graphic-settings").DouyinAuthorDeclaration;
  visibility?: string;
  /** ISO time; when set, submit as platform schedule (not local cron). */
  scheduledAt?: string;
  allowDownload?: boolean;
  cookies: AgentCookie[];
}

export interface PlatformPublishProgressPayload {
  requestId: string;
  targetId: string;
  platform: string;
  phase: PlatformPublishProgressPhase;
  message?: string;
}

export interface PlatformPublishResultPayload {
  requestId: string;
  targetId: string;
  ok: boolean;
  error?: string;
  errorCode?: string;
  platform?: string;
  platformPostId?: string;
  platformUrl?: string;
}

export interface PlatformPublishCancelPayload {
  requestId: string;
}
