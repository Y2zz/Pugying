import { ArticleApiError, type ArticleApiSession } from './article-api';
import {
  runPlatformGraphicPublish,
  type PlatformGraphicPublishOptions,
} from './publish-graphic';

function fixture(platform: 'toutiao' | 'xiaohongshu') {
  const request = vi.fn(
    async (_path: string, _data?: Record<string, unknown>) =>
      platform === 'toutiao'
        ? { code: 0, data: { threadId: '7693773543242304768' } }
        : { code: 0, success: true, data: { id: '68e102001234567890abcdef' } },
  );
  const uploadImage = vi.fn(async (path: string) => ({
    uri: `remote/${path.split('/').pop()}`,
    url: 'https://images.example/pic.png',
    width: 1086,
    height: 1448,
    size: 10,
  }));
  const api: ArticleApiSession = {
    request,
    uploadImage,
    dispose: vi.fn(async () => {}),
  };
  const options: PlatformGraphicPublishOptions = {
    payload: {
      requestId: 'job',
      targetId: 'target',
      platform,
      accountId: 'account',
      contentType: 'graphic',
      title: '桌上留一点绿',
      body: '给桌面留一点空。',
      mediaPaths: ['/tmp/two.png', '/tmp/one.png'],
      coverPath: '',
      cookies: [],
      authorDeclaration: 'ai_generated',
      visibility: platform === 'toutiao' ? 'public' : 'private',
    },
    signal: { cancelled: false },
    onProgress: vi.fn(),
    createSession: vi.fn(async () => api),
  };
  return { options, api, request, uploadImage };
}

it('submits a private Xiaohongshu image note in slot order with an AI declaration and without an extra cover', async () => {
  const { options, request, uploadImage, api } = fixture('xiaohongshu');
  expect(await runPlatformGraphicPublish(options)).toMatchObject({
    ok: true,
    platformPostId: '68e102001234567890abcdef',
  });
  expect(uploadImage.mock.calls.map(([path]) => path)).toEqual(
    options.payload.mediaPaths,
  );
  const [path, data] = request.mock.calls[0] as [string, any];
  expect(path).toBe('/web_api/sns/v2/note');
  expect(data.common).toMatchObject({
    type: 'normal',
    title: '桌上留一点绿',
    desc: '给桌面留一点空。',
    privacy_info: { op_type: 1, type: 1, user_ids: [] },
  });
  expect(JSON.parse(data.common.business_binds)).toMatchObject({
    userDeclarationBind: { origin: 2 },
  });
  expect(data.image_info.images.map((image: any) => image.file_id)).toEqual([
    'remote/two.png',
    'remote/one.png',
  ]);
  expect(JSON.stringify(data)).not.toMatch(/\/tmp\/|cookies/);
  expect(api.dispose).toHaveBeenCalledOnce();
});

it('keeps the title as the first paragraph of a Toutiao micro post and preserves the numeric string receipt', async () => {
  const { options, request } = fixture('toutiao');
  expect(await runPlatformGraphicPublish(options)).toMatchObject({
    ok: true,
    platformPostId: '7693773543242304768',
  });
  const [path, data] = request.mock.calls[0] as [string, any];
  expect(path).toBe('/mp/agw/article/wtt?aid=1231&mp_publish_ab_val=0');
  expect(data.content).toBe('桌上留一点绿\n\n给桌面留一点空。');
  expect(data.image_list).toEqual(['remote/two.png', 'remote/one.png']);
  expect(JSON.parse(JSON.parse(data.extra).info_source)).toEqual({
    source_type: 3,
    source_author_uid: '',
  });
});

it('uses milliseconds in the Xiaohongshu schedule business binding', async () => {
  const { options, request } = fixture('xiaohongshu');
  const time = Math.ceil((Date.now() + 7200000) / 60000) * 60000;
  options.payload.scheduledAt = new Date(time).toISOString();
  await runPlatformGraphicPublish(options);
  expect(
    JSON.parse((request.mock.calls[0][1] as any).common.business_binds),
  ).toMatchObject({ bizType: 13, notePostTiming: { postTime: time } });
});

it.each(['toutiao', 'xiaohongshu'] as const)(
  'stops %s after an image upload fails and disposes the session',
  async (platform) => {
    const { options, api, request, uploadImage } = fixture(platform);
    uploadImage.mockRejectedValueOnce(
      new ArticleApiError('MEDIA_MISSING', '找不到图片，请重新选择'),
    );
    expect(await runPlatformGraphicPublish(options)).toMatchObject({
      ok: false,
      errorCode: 'MEDIA_MISSING',
    });
    expect(request).not.toHaveBeenCalled();
    expect(api.dispose).toHaveBeenCalledOnce();
  },
);

it.each(['toutiao', 'xiaohongshu'] as const)(
  'does not retry %s after losing the submission response',
  async (platform) => {
    const { options, request } = fixture(platform);
    request.mockRejectedValueOnce(new Error('token=secret'));
    const result = await runPlatformGraphicPublish(options);
    expect(result).toMatchObject({
      ok: false,
      errorCode: 'PUBLISH_RESULT_UNKNOWN',
    });
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(request).toHaveBeenCalledOnce();
  },
);

it.each(['toutiao', 'xiaohongshu'] as const)(
  'retains a confirmed %s receipt when cancellation arrives during submission',
  async (platform) => {
    const { options, request } = fixture(platform);
    const receipt = await request('', {});
    request.mockClear().mockImplementationOnce(async () => {
      options.signal.cancelled = true;
      return receipt;
    });
    expect(await runPlatformGraphicPublish(options)).toMatchObject({
      ok: true,
    });
  },
);

it.each([
  ['toutiao', { visibility: 'private' }],
  ['toutiao', { scheduledAt: new Date(Date.now() + 7200000).toISOString() }],
  ['toutiao', { title: '字'.repeat(100), body: '字'.repeat(1950) }],
  ['xiaohongshu', { visibility: 'friends' }],
  ['xiaohongshu', { authorDeclaration: 'personal_opinion' }],
  ['xiaohongshu', { title: '字'.repeat(21) }],
  ['xiaohongshu', { mediaPaths: Array(19).fill('/tmp/a.png') }],
  ['xiaohongshu', { scheduledAt: 'bad' }],
  ['xiaohongshu', { tags: ['日常'] }],
] as const)(
  'rejects unavailable settings for %s before opening a session: %j',
  async (platform, fields) => {
    const { options } = fixture(platform);
    Object.assign(options.payload, fields);
    expect(await runPlatformGraphicPublish(options)).toMatchObject({
      ok: false,
      errorCode: 'invalid_payload',
    });
    expect(options.createSession).not.toHaveBeenCalled();
  },
);

it('requires an exact Xiaohongshu note id before declaring success', async () => {
  const { options, request } = fixture('xiaohongshu');
  request.mockResolvedValueOnce({ code: 0, success: true, data: { id: '' } });
  expect(await runPlatformGraphicPublish(options)).toMatchObject({
    ok: false,
    errorCode: 'PUBLISH_RESULT_UNKNOWN',
  });
});

it('accepts the official Xiaohongshu client fallback code only with a successful exact receipt', async () => {
  const { options, request } = fixture('xiaohongshu');
  request.mockResolvedValueOnce({
    code: 'N/A',
    success: true,
    data: { id: '6ac5d15f00000000140002c3' },
  } as any);
  expect(await runPlatformGraphicPublish(options)).toMatchObject({
    ok: true,
    platformPostId: '6ac5d15f00000000140002c3',
  });
  request.mockResolvedValueOnce({
    code: 'N/A',
    success: false,
    data: { id: '6ac5d15f00000000140002c3' },
  } as any);
  expect(await runPlatformGraphicPublish(options)).toMatchObject({
    ok: false,
    errorCode: 'PUBLISH_RESULT_UNKNOWN',
  });
});
