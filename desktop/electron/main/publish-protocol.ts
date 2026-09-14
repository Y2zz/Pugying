import type { AgentCookie } from './protocol';

export type PlatformPublishProgressPhase =
  | 'accepted'
  | 'fetching_media'
  | 'opening_creator'
  | 'uploading'
  | 'submitting'
  | 'done';

export interface PlatformPublishStartPayload {
  requestId: string;
  /** Backend content target UUID for correlation. */
  targetId: string;
  platform: string;
  accountId: string;
  /** Short-lived signed URL for the finished video. */
  mediaUrl: string;
  /** Required vertical cover (3:4) signed URL. */
  coverUrl: string;
  /** 横版封面（16:9）签名 URL；抖音等平台必填 */
  coverLandscapeUrl: string;
  title: string;
  body?: string;
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
