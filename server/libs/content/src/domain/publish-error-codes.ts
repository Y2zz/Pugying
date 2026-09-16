/** 发布回执稳定错误码（前后端 / Agent 共用约定） */
export const PublishErrorCodes = {
  AUTH_EXPIRED: 'AUTH_EXPIRED',
  CANCELLED: 'cancelled',
  /** 本机源文件不可读（已删 / 拔盘 / 离线） */
  MEDIA_MISSING: 'MEDIA_MISSING',
  /** @deprecated 兼容旧回执；新代码用 MEDIA_MISSING */
  MEDIA_UNREACHABLE: 'MEDIA_UNREACHABLE',
  ADAPTER_UI_CHANGED: 'ADAPTER_UI_CHANGED',
  ADAPTER_PARTIAL: 'ADAPTER_PARTIAL',
  PUBLISH_FAILED: 'PUBLISH_FAILED',
  UNSUPPORTED_PLATFORM: 'unsupported_platform',
} as const;

export type PublishErrorCode =
  (typeof PublishErrorCodes)[keyof typeof PublishErrorCodes];

export function isAuthExpiredCode(code: string | null | undefined): boolean {
  return code === PublishErrorCodes.AUTH_EXPIRED;
}
