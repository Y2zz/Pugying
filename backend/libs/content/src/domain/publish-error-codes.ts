/** 发布回执稳定错误码（前后端 / Agent 共用约定） */
export const PublishErrorCodes = {
  AUTH_EXPIRED: 'AUTH_EXPIRED',
  CANCELLED: 'cancelled',
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
