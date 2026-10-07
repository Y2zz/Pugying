import { describe, expect, it } from 'vitest';
import {
  describeCaughtError,
  describePublishError,
  describePublishPhase,
  isRetryablePublishError,
} from '@/lib/publish-errors';

describe('describePublishError', () => {
  it('maps stable codes to Chinese copy', () => {
    expect(describePublishError('AUTH_EXPIRED')).toContain('重新授权');
    expect(describePublishError('MEDIA_MISSING')).toContain(
      '本机视频、图片或封面',
    );
    expect(describePublishError('MEDIA_UNREACHABLE')).toContain(
      '本机视频、图片或封面',
    );
    expect(describePublishError('PUBLISH_FAILED')).toContain('内容列表重试');
    expect(describePublishError('PUBLISH_FAILED', '平台拒绝')).toBe('平台拒绝');
  });

  it('falls back to message or generic', () => {
    expect(describePublishError('UNKNOWN', '自定义')).toBe('自定义');
    expect(describePublishError(null)).toBe('发布失败');
    expect(describePublishError('UNKNOWN')).toBe('发布失败');
  });

  it('keeps adapter and pipeline codes restrained', () => {
    expect(describePublishError('ADAPTER_UI_CHANGED')).not.toMatch(
      /DOM|HTTP|抓包|选择器/i,
    );
    expect(describePublishError('ADAPTER_PARTIAL')).toContain('打开的窗口');
    expect(describePublishError('HTTP_PIPELINE_NOT_CONFIGURED')).toBe(
      '暂时无法自动发布，请稍后重试',
    );
  });
});

describe('describePublishPhase', () => {
  it('maps agent phases', () => {
    expect(describePublishPhase('fetching_media')).toBe('校验素材与封面');
    expect(describePublishPhase('submitting')).toBe('提交发布');
  });
});

describe('describeCaughtError', () => {
  it('maps known codes from Error.message', () => {
    expect(describeCaughtError(new Error('busy'))).toContain(
      '正有其它发布任务',
    );
  });

  it('keeps Chinese backend messages', () => {
    expect(describeCaughtError(new Error('发布进行中，请勿重复提交'))).toBe(
      '发布进行中，请勿重复提交',
    );
  });
});

describe('isRetryablePublishError', () => {
  it('includes PUBLISH_FAILED', () => {
    expect(isRetryablePublishError('PUBLISH_FAILED')).toBe(true);
    expect(isRetryablePublishError('unsupported_platform')).toBe(false);
  });
  it('keeps unknown commit results out of retryable errors', () => {
    expect(isRetryablePublishError('PUBLISH_RESULT_UNKNOWN')).toBe(false);
    expect(describePublishError('PUBLISH_RESULT_UNKNOWN')).toContain(
      '先到平台查看',
    );
    expect(describePublishError('PLATFORM_VERIFICATION_REQUIRED')).toContain(
      '创作者中心',
    );
  });
});
