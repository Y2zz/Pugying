import { runDouyinHttpPublish } from './publish-douyin-http';
import { ArticleApiError } from './article-api';
import type { PlatformPublishStartPayload } from '../publish-protocol';

function setup(overrides: Partial<PlatformPublishStartPayload> = {}) {
  const payload: PlatformPublishStartPayload = {
    requestId: 'request',
    targetId: 'target',
    platform: 'douyin',
    accountId: 'account',
    contentType: 'video',
    mediaPath: '/video.mp4',
    coverPath: '/portrait.jpg',
    coverLandscapePath: '/landscape.jpg',
    title: '窗边的绿',
    body: '午后停一会儿。',
    tags: ['日常'],
    visibility: 'private',
    allowDownload: false,
    authorDeclaration: 'ai_generated',
    cookies: [{ name: 'sessionid', value: 'private' }],
    ...overrides,
  };
  const api = {
    uploadVideo: vi.fn(async () => ({
      vid: 'v-real',
      duration: 8,
      width: 720,
      height: 960,
      coverUri: 'video/frame',
    })),
    uploadImage: vi.fn(async (path: string) => ({
      uri: path === '/portrait.jpg' ? 'image/portrait' : 'image/landscape',
      url: 'https://image.example/a.jpg',
      width: path === '/portrait.jpg' ? 720 : 960,
      height: path === '/portrait.jpg' ? 960 : 720,
      size: 1,
    })),
    request: vi.fn(async (path: string) =>
      path.startsWith('/aweme/v1/search/')
        ? { status_code: 0, sug_list: [{ cha_name: '日常', cid: '1234' }] }
        : { status_code: 0, item_id: '7693773543242304768' },
    ),
    dispose: vi.fn(async () => {}),
  };
  const createSession = vi.fn(async () => api);
  const input = {
    payload,
    signal: { cancelled: false },
    onProgress: vi.fn(),
    createSession,
  };
  return { api, input, createSession };
}

it('uploads the video and both covers, submits official fields and only succeeds with an exact platform receipt', async () => {
  const { api, input } = setup();
  const result = await runDouyinHttpPublish(input);
  expect(api.uploadVideo).toHaveBeenCalledWith('/video.mp4');
  expect(api.uploadImage.mock.calls.map(([path]) => path)).toEqual([
    '/portrait.jpg',
    '/landscape.jpg',
  ]);
  expect(api.request).toHaveBeenLastCalledWith(
    '/web/api/media/aweme/create_v2/',
    {
      item: {
        common: {
          media_type: 4,
          video_id: 'v-real',
          creation_id: 'request',
          text: '窗边的绿 午后停一会儿。\n#日常',
          caption: '午后停一会儿。\n#日常',
          item_title: '窗边的绿',
          visibility_type: 1,
          download: 0,
          timing: 0,
          text_extra: JSON.stringify([
            {
              start: 13,
              end: 16,
              caption_start: 8,
              caption_end: 11,
              hashtag_id: '1234',
              hashtag_name: '日常',
              type: 1,
            },
          ]),
          challenges: '["1234"]',
          mentions: '[]',
          activity: '[]',
          hashtag_source: 'search',
        },
        cover: {
          upload_poster: 'image/portrait',
          poster_delay: 0,
          custom_cover_image_width: 720,
          custom_cover_image_height: 960,
          horizontal_custom_cover_image_uri: 'image/landscape',
          horizontal_custom_cover_image_width: 960,
          horizontal_custom_cover_image_height: 720,
          horizontal_cover_tsp: 0,
        },
        assistant: { is_preview: 0, is_post_assistant: 0 },
        declare: { user_declare_info: '{"choose_value":"aigc"}' },
      },
    },
  );
  expect(result).toMatchObject({
    ok: true,
    platformPostId: '7693773543242304768',
    platformUrl: 'https://www.douyin.com/video/7693773543242304768',
  });
  expect(api.dispose).toHaveBeenCalledOnce();
});

it('attaches the selected Douyin collection as mix on create_v2', async () => {
  const { api, input } = setup({
    collectionRef: { id: '7693814736445508899', name: '日常合集' },
    topicRefs: [{ id: '1234', name: '日常' }],
  });
  expect((await runDouyinHttpPublish(input)).ok).toBe(true);
  expect(api.request).toHaveBeenLastCalledWith(
    '/web/api/media/aweme/create_v2/',
    expect.objectContaining({
      item: expect.objectContaining({
        mix: { mix_id: '7693814736445508899', mix_order: 0 },
      }),
    }),
  );
});

it('uses the uploaded first frame when covers are absent and maps friends/schedule/download settings', async () => {
  const scheduledAt = new Date(Date.now() + 4 * 3600000).toISOString();
  const { input, api } = setup({
    coverPath: '',
    coverLandscapePath: '',
    visibility: 'friends',
    scheduledAt,
    allowDownload: true,
    authorDeclaration: 'none',
  });
  expect((await runDouyinHttpPublish(input)).ok).toBe(true);
  expect(api.uploadImage).not.toHaveBeenCalled();
  expect(api.request).toHaveBeenLastCalledWith(
    '/web/api/media/aweme/create_v2/',
    expect.objectContaining({
      item: expect.objectContaining({
        common: expect.objectContaining({
          visibility_type: 2,
          timing: Math.floor(Date.parse(scheduledAt) / 1000),
          download: 1,
        }),
        cover: { poster: 'video/frame', poster_delay: 0 },
      }),
    }),
  );
});

it.each([
  { title: 'x'.repeat(31) },
  { body: 'x'.repeat(1001) },
  { visibility: 'unsupported' },
  { scheduledAt: new Date(Date.now() + 3600000).toISOString() },
  { tags: ['bad tag'] },
])(
  'rejects invalid settings before opening the account session: %j',
  async (overrides) => {
    const { input, createSession } = setup(overrides);
    expect(await runDouyinHttpPublish(input)).toMatchObject({
      ok: false,
      errorCode: 'invalid_payload',
    });
    expect(createSession).not.toHaveBeenCalled();
  },
);

it.each([
  [{ status_code: 0 }, 'PUBLISH_RESULT_UNKNOWN'],
  [{ status_code: 0, item_id: 7693773543242304768 }, 'PUBLISH_RESULT_UNKNOWN'],
  [{ status_code: 8 }, 'AUTH_EXPIRED'],
  [{ status_code: 2222 }, 'PLATFORM_VERIFICATION_REQUIRED'],
  [{ status_code: 400 }, 'PLATFORM_REJECTED'],
])(
  'does not fake success or retry a rejected/incomplete receipt: %j',
  async (response, code) => {
    const { api, input } = setup({ tags: [] });
    api.request.mockResolvedValueOnce(response as any);
    expect(await runDouyinHttpPublish(input)).toMatchObject({
      ok: false,
      errorCode: code,
    });
    expect(api.request).toHaveBeenCalledOnce();
    expect(api.dispose).toHaveBeenCalledOnce();
  },
);

it('retains success when cancellation arrives after submit', async () => {
  const { api, input } = setup({ tags: [] });
  api.request.mockImplementationOnce(async () => {
    input.signal.cancelled = true;
    return { status_code: 0, item_id: '7693773543242304768' };
  });
  expect(await runDouyinHttpPublish(input)).toMatchObject({
    ok: true,
    platformPostId: '7693773543242304768',
  });
});

it('cancels before submit without sending a create request', async () => {
  const { api, input } = setup({ tags: [] });
  api.uploadVideo.mockImplementationOnce(async () => {
    input.signal.cancelled = true;
    return {
      vid: 'v-real',
      duration: 8,
      width: 720,
      height: 960,
      coverUri: 'video/frame',
    };
  });
  expect(await runDouyinHttpPublish(input)).toMatchObject({
    ok: false,
    errorCode: 'cancelled',
  });
  expect(api.request).not.toHaveBeenCalled();
});

it('classifies a lost submit response as unknown, never exposes credentials and never re-submits', async () => {
  const { api, input } = setup({ tags: [] });
  api.request.mockRejectedValueOnce(new Error('private Cookie details'));
  const result = await runDouyinHttpPublish(input);
  expect(result).toMatchObject({
    ok: false,
    errorCode: 'PUBLISH_RESULT_UNKNOWN',
  });
  expect(result.error).not.toContain('Cookie');
  expect(api.request).toHaveBeenCalledOnce();
});

it('reports a missing media file without submitting and clears the session', async () => {
  const { api, input } = setup({ tags: [] });
  api.uploadVideo.mockRejectedValueOnce(
    new ArticleApiError('MEDIA_MISSING', '找不到视频，请重新选择'),
  );
  expect(await runDouyinHttpPublish(input)).toMatchObject({
    ok: false,
    errorCode: 'MEDIA_MISSING',
  });
  expect(api.request).not.toHaveBeenCalled();
  expect(api.dispose).toHaveBeenCalledOnce();
});
