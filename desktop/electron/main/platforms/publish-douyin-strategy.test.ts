import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  PlatformPublishResultPayload,
  PlatformPublishStartPayload,
} from '../publish-protocol';
import {
  resolveDouyinPublishMode,
  runDouyinPublishByMode,
  type DouyinPublishDependencies,
} from './publish-douyin-strategy';

const payload: PlatformPublishStartPayload = {
  requestId: 'request-1',
  targetId: 'target-1',
  platform: 'douyin',
  accountId: 'account-1',
  mediaUrl: 'https://media.invalid/video',
  coverUrl: 'https://media.invalid/cover',
  coverLandscapeUrl: 'https://media.invalid/cover-landscape',
  title: '标题',
  cookies: [{ name: 'sessionid', value: 'cookie' }],
};

function result(ok: boolean, errorCode?: string): PlatformPublishResultPayload {
  return {
    requestId: payload.requestId,
    targetId: payload.targetId,
    platform: payload.platform,
    ok,
    errorCode,
  };
}

function dependencies(options?: {
  httpResult?: PlatformPublishResultPayload;
}): DouyinPublishDependencies & {
  runDom: ReturnType<typeof vi.fn>;
  runHttp: ReturnType<typeof vi.fn>;
} {
  const runDom = vi.fn().mockResolvedValue(result(true));
  const runHttp = vi
    .fn()
    .mockResolvedValue(options?.httpResult ?? result(true));
  return { runDom, runHttp };
}

afterEach(() => {
  delete process.env.PUGYING_DOUYIN_PUBLISH_MODE;
});

describe('抖音发布策略分发', () => {
  it('默认使用现有 DOM 路径', async () => {
    const deps = dependencies();
    const actual = await runDouyinPublishByMode(
      { payload, onProgress: vi.fn(), signal: { cancelled: false } },
      deps,
    );

    expect(actual.ok).toBe(true);
    expect(deps.runDom).toHaveBeenCalledOnce();
    expect(deps.runHttp).not.toHaveBeenCalled();
  });

  it('http 模式不回退 DOM', async () => {
    process.env.PUGYING_DOUYIN_PUBLISH_MODE = 'http';
    const deps = dependencies({
      httpResult: result(false, 'HTTP_PIPELINE_NOT_CONFIGURED'),
    });
    const actual = await runDouyinPublishByMode(
      { payload, onProgress: vi.fn(), signal: { cancelled: false } },
      deps,
    );

    expect(actual.errorCode).toBe('HTTP_PIPELINE_NOT_CONFIGURED');
    expect(deps.runHttp).toHaveBeenCalledOnce();
    expect(deps.runDom).not.toHaveBeenCalled();
  });

  it('http_then_dom 在 HTTP 失败后回退 DOM', async () => {
    process.env.PUGYING_DOUYIN_PUBLISH_MODE = 'http_then_dom';
    const deps = dependencies({
      httpResult: result(false, 'HTTP_PIPELINE_NOT_CONFIGURED'),
    });
    const onProgress = vi.fn();
    const actual = await runDouyinPublishByMode(
      { payload, onProgress, signal: { cancelled: false } },
      deps,
    );

    expect(actual.ok).toBe(true);
    expect(deps.runHttp).toHaveBeenCalledOnce();
    expect(deps.runDom).toHaveBeenCalledOnce();
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('切换 DOM') }),
    );
  });

  it('拒绝非法模式配置', () => {
    expect(() => resolveDouyinPublishMode('unknown')).toThrow(
      'PUGYING_DOUYIN_PUBLISH_MODE 配置无效',
    );
  });
});
