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
]);

/** 前端展示用：稳定错误码 → 用户可读说明 */
export function describePublishError(
  errorCode: string | null | undefined,
  fallback?: string | null,
): string {
  switch (errorCode) {
    case 'AUTH_EXPIRED':
      return '抖音登录已失效，请到「媒体账号」重新授权后再重试';
    case 'MEDIA_MISSING':
    case 'MEDIA_UNREACHABLE':
      // MEDIA_UNREACHABLE 为旧码别名，文案与 MEDIA_MISSING 一致
      return '找不到本机视频或封面文件，请确认文件未被移动或删除后再重试';
    case 'ADAPTER_UI_CHANGED':
      return '抖音创作者页结构有变，未能自动定位控件；已打开窗口时可手动完成，或稍后更新 Agent';
    case 'ADAPTER_PARTIAL':
      return '已尽量自动填写，请在打开的抖音窗口确认封面并点击发布；完成后可在内容列表查看或重试';
    case 'HTTP_PIPELINE_NOT_CONFIGURED':
      return 'Agent 尚未配置抖音 HTTP 发布映射，请改用 DOM 模式或先完成抓包对齐';
    case 'HTTP_TIMEOUT':
    case 'HTTP_REQUEST_FAILED':
      return fallback?.trim() || '抖音后台 HTTP 请求失败，可重试或切换 DOM 模式';
    case 'PUBLISH_FAILED':
      return fallback?.trim() || '发布未成功，可在内容列表重试';
    case 'cancelled':
      return '发布已取消';
    case 'busy':
      return '本机 Agent 正忙于其它发布任务，请稍候再试';
    case 'unsupported_platform':
      return 'P0 仅支持抖音短视频发布';
    default:
      return fallback?.trim() || errorCode || '发布失败';
  }
}

/** Agent 推送的 phase 偏机器可读，进度提示需中文 */
export function describePublishPhase(
  phase: PlatformPublishProgressPhase | string | null | undefined,
): string {
  switch (phase) {
    case 'accepted':
      return '已受理';
    case 'fetching_media':
      return '拉取视频与封面';
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
