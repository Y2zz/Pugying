import type { PlatformPublishProgressPhase } from '@/lib/agent-client';

const KNOWN_CODES = new Set([
  'AUTH_EXPIRED',
  'MEDIA_MISSING',
  'MEDIA_UNREACHABLE',
  'ADAPTER_UI_CHANGED',
  'ADAPTER_PARTIAL',
  'HTTP_PIPELINE_NOT_CONFIGURED',
  'HTTP_TIMEOUT',
  'HTTP_REQUEST_FAILED',
  'PUBLISH_FAILED',
  'cancelled',
  'busy',
  'unsupported_platform',
  'ARTICLE_API_CHANGED',
  'ARTICLE_IMAGE_UNSUPPORTED',
  'ARTICLE_FORMAT_UNSUPPORTED',
  'ARTICLE_SETTINGS_UNSUPPORTED',
  'ARTICLE_SETTINGS_UNAVAILABLE',
  'ARTICLE_PUBLISH_LIMIT_REACHED',
  'PLATFORM_VERIFICATION_REQUIRED',
  'PLATFORM_REJECTED',
  'PUBLISH_RESULT_UNKNOWN',
  'invalid_payload',
]);

/** 前端展示用：稳定错误码 → 用户可读说明 */
export function describePublishError(
  errorCode: string | null | undefined,
  fallback?: string | null,
): string {
  switch (errorCode) {
    case 'AUTH_EXPIRED':
      return '账号登录已失效，请到「媒体账号」重新授权后再重试';
    case 'MEDIA_MISSING':
    case 'MEDIA_UNREACHABLE':
      // MEDIA_UNREACHABLE 为旧码别名，文案与 MEDIA_MISSING 一致
      return '找不到本机视频、图片或封面文件，请确认文件未被移动或删除后再重试';
    case 'ADAPTER_UI_CHANGED':
      return '未能自动完成，请在打开的窗口里确认并发布';
    case 'ADAPTER_PARTIAL':
      return '未能自动完成，请在打开的窗口里确认发布结果';
    case 'HTTP_PIPELINE_NOT_CONFIGURED':
      return '暂时无法自动发布，请稍后重试';
    case 'HTTP_TIMEOUT':
    case 'HTTP_REQUEST_FAILED':
      return fallback?.trim() || '暂时无法连接发布平台，请稍后重试';
    case 'ARTICLE_API_CHANGED':
      return '暂时无法连接文章发布功能，请稍后重试或更新应用';
    case 'ARTICLE_PUBLISH_LIMIT_REACHED':
      return '今日投稿次数已用完，请额度恢复后重试';
    case 'ARTICLE_IMAGE_UNSUPPORTED':
    case 'ARTICLE_FORMAT_UNSUPPORTED':
    case 'ARTICLE_SETTINGS_UNSUPPORTED':
    case 'ARTICLE_SETTINGS_UNAVAILABLE':
    case 'invalid_payload':
      return fallback?.trim() || '请检查文章内容、图片和发布设置后重试';
    case 'PLATFORM_VERIFICATION_REQUIRED':
      return '平台需要验证，请到创作者中心完成后再发布';
    case 'PLATFORM_REJECTED':
      return '平台未接受本次发布，请到创作者中心查看账号或内容要求';
    case 'PUBLISH_RESULT_UNKNOWN':
      return '尚未确认发布结果，请先到平台查看，避免重复发布';
    case 'PUBLISH_FAILED':
      return fallback?.trim() || '发布未成功，可在内容列表重试';
    case 'cancelled':
      return '发布已取消';
    case 'busy':
      return '正有其它发布任务进行中，请稍候再试';
    case 'unsupported_platform':
      return '该平台暂不支持此类内容发布';
    default:
      // 未知码不把内部字面量甩给用户；有 fallback 才展示
      return fallback?.trim() || '发布失败';
  }
}

/** 发布进度 phase 偏机器可读，需转为中文提示 */
export function describePublishPhase(
  phase: PlatformPublishProgressPhase | string | null | undefined,
): string {
  switch (phase) {
    case 'accepted':
      return '已受理';
    case 'fetching_media':
      return '校验素材与封面';
    case 'opening_creator':
      return '打开创作者中心';
    case 'uploading':
      return '上传到平台';
    case 'submitting':
      return '提交发布';
    case 'done':
      return '完成';
    default:
      return phase?.trim() || '处理中';
  }
}

/**
 * 将接口/异常原文尽量映射为可读说明。
 * 已知稳定码走 describePublishError；其余保留原文（后端已是中文时直接展示）。
 */
export function describeCaughtError(
  err: unknown,
  fallback = '操作失败',
): string {
  const raw =
    err instanceof Error
      ? err.message.trim()
      : typeof err === 'string'
        ? err.trim()
        : '';
  if (!raw) {
    return fallback;
  }
  if (KNOWN_CODES.has(raw)) {
    return describePublishError(raw);
  }
  return raw;
}

export function isRetryablePublishError(
  errorCode: string | null | undefined,
): boolean {
  return (
    errorCode === 'AUTH_EXPIRED' ||
    errorCode === 'ADAPTER_PARTIAL' ||
    errorCode === 'ADAPTER_UI_CHANGED' ||
    errorCode === 'HTTP_PIPELINE_NOT_CONFIGURED' ||
    errorCode === 'HTTP_TIMEOUT' ||
    errorCode === 'HTTP_REQUEST_FAILED' ||
    errorCode === 'MEDIA_MISSING' ||
    errorCode === 'MEDIA_UNREACHABLE' ||
    errorCode === 'PUBLISH_FAILED' ||
    errorCode === 'cancelled'
  );
}
