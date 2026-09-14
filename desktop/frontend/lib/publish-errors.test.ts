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
    expect(describePublishError('PUBLISH_FAILED')).toContain('内容列表重试');
    expect(describePublishError('PUBLISH_FAILED', '平台拒绝')).toBe('平台拒绝');
  });

  it('falls back to message or generic', () => {
    expect(describePublishError('UNKNOWN', '自定义')).toBe('自定义');
    expect(describePublishError(null)).toBe('发布失败');
  });
});

describe('describePublishPhase', () => {
  it('maps agent phases', () => {
    expect(describePublishPhase('fetching_media')).toBe('拉取视频与封面');
    expect(describePublishPhase('submitting')).toBe('提交发布');
  });
});

describe('describeCaughtError', () => {
  it('maps known codes from Error.message', () => {
    expect(describeCaughtError(new Error('busy'))).toContain('正忙');
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
});
