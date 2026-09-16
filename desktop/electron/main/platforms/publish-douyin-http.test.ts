import { describe, expect, it, vi } from 'vitest';
import type { PlatformPublishStartPayload } from '../publish-protocol';
import {
  DOUYIN_HTTP_NOT_CONFIGURED,
  runDouyinHttpPublish,
} from './publish-douyin-http';

describe('runDouyinHttpPublish', () => {
  it('未注入抓包映射时明确失败且不拉取媒体', async () => {
    const payload: PlatformPublishStartPayload = {
      requestId: 'request-1',
      targetId: 'target-1',
      platform: 'douyin',
      accountId: 'account-1',
      mediaPath: '/tmp/should-not-matter.mp4',
      coverPath: '/tmp/should-not-matter-cover.jpg',
      coverLandscapePath: '/tmp/should-not-matter-landscape.jpg',
      title: '标题',
      cookies: [{ name: 'sessionid', value: 'cookie' }],
    };
    const onProgress = vi.fn();

    const result = await runDouyinHttpPublish({
      payload,
      onProgress,
      signal: { cancelled: false },
    });

    expect(result).toMatchObject({
      ok: false,
      errorCode: DOUYIN_HTTP_NOT_CONFIGURED,
    });
    expect(result.error).toContain('抓包');
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'accepted' }),
    );
  });
});
