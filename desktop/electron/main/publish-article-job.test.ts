import { cancelPublishJob, startPublishJob } from './publish-job';
import { runDouyinArticlePublish } from './platforms/publish-douyin-article';
import { runToutiaoArticlePublish } from './platforms/publish-toutiao-article';
import { runBilibiliArticlePublish } from './platforms/publish-bilibili-article';
import type { PlatformPublishStartPayload } from './publish-protocol';

vi.mock('./platforms/publish-douyin-article', () => ({
  runDouyinArticlePublish: vi.fn(async ({ payload }) => ({
    requestId: payload.requestId,
    targetId: payload.targetId,
    ok: false,
    error: 'PLATFORM_REJECTED',
    errorCode: 'PLATFORM_REJECTED',
  })),
}));

vi.mock('./platforms/publish-toutiao-article', () => ({
  runToutiaoArticlePublish: vi.fn(async ({ payload }) => ({
    requestId: payload.requestId,
    targetId: payload.targetId,
    ok: true,
    platformPostId: '123',
  })),
}));
vi.mock('./platforms/publish-bilibili-article', () => ({
  runBilibiliArticlePublish: vi.fn(async ({ payload }) => ({
    requestId: payload.requestId,
    targetId: payload.targetId,
    ok: true,
    platformPostId: '123',
  })),
}));

const payload: PlatformPublishStartPayload = {
  requestId: 'article-format-test',
  targetId: 'target',
  platform: 'douyin',
  accountId: 'account',
  contentType: 'article',
  coverPath: '/tmp/cover.png',
  title: '文章',
  cookies: [{ name: 'session', value: 'test' }],
  mediaPaths: ['/tmp/image.png'],
  body: '<p class="editor">正文</p><img src="file:///tmp/image.png" data-local-path="/tmp/image.png">',
};

beforeEach(() => {
  vi.stubEnv('PUGYING_PUBLISH_STUB', '0');
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

it('gives the article adapter parsed content instead of editor HTML', async () => {
  await new Promise<void>((resolve) => {
    expect(
      startPublishJob({
        payload,
        onProgress: vi.fn(),
        onResult: () => resolve(),
      }),
    ).toEqual({ ok: true });
  });
  const options = vi.mocked(runDouyinArticlePublish).mock.calls[0][0];
  expect(options.payload).not.toHaveProperty('body');
  expect(options.article.imagePaths).toEqual(['/tmp/image.png']);
  expect(options.article.nodes[0]).toEqual({
    kind: 'element',
    tag: 'p',
    children: [{ kind: 'text', text: '正文' }],
  });
});

it('fails before calling the adapter when an embedded image cannot be resolved', async () => {
  const result = await new Promise<{ ok: boolean }>((resolve) => {
    startPublishJob({
      payload: { ...payload, mediaPaths: [] },
      onProgress: vi.fn(),
      onResult: resolve,
    });
  });
  expect(result.ok).toBe(false);
  expect(runDouyinArticlePublish).not.toHaveBeenCalled();
});

it.each(['toutiao', 'bilibili'])(
  'routes %s articles without mandatory covers and bypasses the stub',
  async (platform) => {
    vi.stubEnv('PUGYING_PUBLISH_STUB', '1');
    const result = await new Promise<{ ok: boolean; platformPostId?: string }>(
      (resolve) => {
        expect(
          startPublishJob({
            payload: { ...payload, platform, coverPath: '' },
            onProgress: vi.fn(),
            onResult: resolve,
          }),
        ).toEqual({ ok: true });
      },
    );
    expect(result).toMatchObject({ ok: true, platformPostId: '123' });
    expect(
      platform === 'toutiao'
        ? runToutiaoArticlePublish
        : runBilibiliArticlePublish,
    ).toHaveBeenCalledOnce();
  },
);

it.each([true, false])(
  'preserves the article receipt or unknown result when cancellation arrives after submission (%s)',
  async (ok) => {
    let settle: (value: any) => void = () => {};
    vi.mocked(runDouyinArticlePublish).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          settle = resolve;
        }),
    );
    const onResult = vi.fn();
    startPublishJob({ payload, onProgress: vi.fn(), onResult });
    await vi.waitFor(() =>
      expect(runDouyinArticlePublish).toHaveBeenCalledOnce(),
    );
    cancelPublishJob(payload.requestId);
    settle({
      requestId: payload.requestId,
      targetId: payload.targetId,
      ok,
      ...(ok
        ? { platformPostId: '123' }
        : { errorCode: 'PUBLISH_RESULT_UNKNOWN' }),
    });
    await vi.waitFor(() => expect(onResult).toHaveBeenCalledOnce());
    expect(onResult.mock.calls[0][0]).toMatchObject(
      ok
        ? { ok: true, platformPostId: '123' }
        : { errorCode: 'PUBLISH_RESULT_UNKNOWN' },
    );
  },
);
