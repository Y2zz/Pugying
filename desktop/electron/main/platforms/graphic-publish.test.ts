import { ArticleApiError, type ArticleApiSession } from './article-api';
import {
  douyinGraphicCaption,
  runDouyinGraphicPublish,
  type GraphicPublishOptions,
} from './publish-douyin-graphic';

const ID = '7561234567890123456';
function fixture() {
  const request = vi.fn(
    async (
      path: string,
      _data?: Record<string, unknown>,
    ): Promise<Record<string, unknown>> => {
      if (path.includes('challengesug')) {
        return {
          status_code: 0,
          sug_list: [
            { cha_name: '日常', cid: '111' },
            { cha_name: '绿植', cid: '222' },
          ],
        };
      }
      return { status_code: 0, item_id: ID };
    },
  );
  const uploadImage = vi.fn(async (path: string) => ({
    uri: `uri-${path.split('/').pop()}`,
    url: 'https://images.example/picture.png',
    width: 900,
    height: 1200,
    size: 10,
  }));
  const api: ArticleApiSession = {
    request,
    uploadImage,
    dispose: vi.fn(async () => {}),
  };
  const options: GraphicPublishOptions = {
    payload: {
      requestId: 'job',
      targetId: 'target',
      platform: 'douyin',
      accountId: 'account',
      contentType: 'graphic',
      title: '桌上留一点绿',
      body: '给桌面留一点空。\n#日常',
      tags: ['日常', '绿植'],
      // 默认带已绑定标识，避免各用例被话题搜索请求打乱断言顺序
      topicRefs: [
        { id: '111', name: '日常' },
        { id: '222', name: '绿植' },
      ],
      mediaPaths: ['/tmp/second.png', '/tmp/first.png'],
      coverPath: '/tmp/first.png',
      cookies: [],
    },
    signal: { cancelled: false },
    onProgress: vi.fn(),
    createSession: vi.fn(async () => api),
  };
  return { options, api, request, uploadImage };
}

it('publishes ordered uploaded images with a cover, private visibility, download setting, title markers and AI declaration', async () => {
  const { options, api, request, uploadImage } = fixture();
  Object.assign(options.payload, {
    visibility: 'private',
    allowDownload: false,
    authorDeclaration: 'ai_generated',
  });
  expect(await runDouyinGraphicPublish(options)).toMatchObject({
    ok: true,
    platformPostId: ID,
    platformUrl: `https://www.douyin.com/note/${ID}`,
  });
  expect(uploadImage.mock.calls.map(([path]) => path)).toEqual([
    '/tmp/second.png',
    '/tmp/first.png',
  ]);
  const createCall = request.mock.calls.find(([path]) =>
    String(path).includes('create_v2'),
  ) as [string, any];
  expect(createCall[0]).toBe('/web/api/media/aweme/create_v2/');
  const data = createCall[1];
  expect(data.item.common).toMatchObject({
    media_type: 2,
    text: '桌上留一点绿。给桌面留一点空。\n#日常\n#绿植',
    visibility_type: 1,
    download: 0,
    timing: -1,
    images: [
      { uri: 'uri-second.png', width: 900, height: 1200 },
      { uri: 'uri-first.png', width: 900, height: 1200 },
    ],
  });
  expect(data.item.cover).toEqual({ poster: 'uri-first.png' });
  expect(JSON.parse(data.item.declare.user_declare_info)).toEqual({
    choose_value: 'aigc',
  });
  expect(JSON.stringify(data)).not.toMatch(/\/tmp\/|cookies/);
  expect(api.dispose).toHaveBeenCalledOnce();
});

it('uses UTF-16 offsets and does not append a second title separator', () => {
  const caption = douyinGraphicCaption('绿🌿。', '桌面 #日常', [
    { id: '88', name: '日常' },
  ]);
  expect(caption.text).toBe('绿🌿。桌面 #日常');
  expect(JSON.parse(caption.text_extra)).toEqual([
    { start: 0, end: 4, hashtag_id: 0, hashtag_name: '', type: 7 },
    { start: 7, end: 10, hashtag_id: '88', hashtag_name: '日常', type: 1 },
  ]);
});

it('uses saved topic resource ids without searching again', async () => {
  const { options, api, request } = fixture();
  options.payload.topicRefs = [
    { id: '555', name: '日常' },
    { id: '666', name: '绿植' },
  ];
  expect(await runDouyinGraphicPublish(options)).toMatchObject({ ok: true });
  expect(
    request.mock.calls.some(([path]) => String(path).includes('challengesug')),
  ).toBe(false);
  const createCall = request.mock.calls.find(([path]) =>
    String(path).includes('create_v2'),
  ) as [string, any];
  expect(JSON.parse(createCall[1].item.common.text_extra)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ hashtag_id: '555', hashtag_name: '日常' }),
      expect.objectContaining({ hashtag_id: '666', hashtag_name: '绿植' }),
    ]),
  );
  expect(api.dispose).toHaveBeenCalledOnce();
});

it('searches unbound tag names before submitting', async () => {
  const { options, request } = fixture();
  options.payload.topicRefs = undefined;
  expect(await runDouyinGraphicPublish(options)).toMatchObject({ ok: true });
  expect(
    request.mock.calls.filter(([path]) =>
      String(path).includes('challengesug'),
    ),
  ).toHaveLength(2);
  const createCall = request.mock.calls.find(([path]) =>
    String(path).includes('create_v2'),
  ) as [string, any];
  expect(JSON.parse(createCall[1].item.common.text_extra)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ hashtag_id: '111', hashtag_name: '日常' }),
      expect.objectContaining({ hashtag_id: '222', hashtag_name: '绿植' }),
    ]),
  );
});

it.each([
  { title: '文'.repeat(21) },
  { body: '' },
  { body: '文'.repeat(1001) },
  { mediaPaths: [] },
  { mediaPaths: Array(31).fill('/tmp/image.png') },
  { coverPath: '' },
  { visibility: 'invalid' },
  { authorDeclaration: 'invalid' },
  { scheduledAt: new Date(Date.now() + 3600000).toISOString() },
  { tags: ['话题一', '话题二', '话题三', '话题四', '话题五', '话题六'] },
])('rejects invalid input before creating a session: %j', async (fields) => {
  const { options, request } = fixture();
  Object.assign(options.payload, fields);
  expect(await runDouyinGraphicPublish(options)).toMatchObject({
    ok: false,
    errorCode: 'invalid_payload',
  });
  expect(options.createSession).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
});

it.each([
  ['personal_opinion', 'personal_opinion'],
  ['reposted', 'from_net_v3'],
  ['marketing', 'marketing'],
  ['fictional', 'only_fun_new'],
] as const)(
  'maps %s to the current declaration contract',
  async (declaration, value) => {
    const { options, request } = fixture();
    options.payload.authorDeclaration = declaration;
    await runDouyinGraphicPublish(options);
    const createCall = request.mock.calls.find(([path]) =>
      String(path).includes('create_v2'),
    ) as [string, any];
    expect(
      JSON.parse(createCall[1].item.declare.user_declare_info),
    ).toEqual({ choose_value: value });
  },
);

it('preserves scheduling and friend visibility without an unnecessary declaration', async () => {
  const { options, request } = fixture();
  const time = Date.now() + 3 * 3600000;
  Object.assign(options.payload, {
    scheduledAt: new Date(time).toISOString(),
    visibility: 'friends',
  });
  await runDouyinGraphicPublish(options);
  const createCall = request.mock.calls.find(([path]) =>
    String(path).includes('create_v2'),
  ) as [string, any];
  const item = createCall[1].item;
  expect(item.common.timing).toBe(Math.floor(time / 1000));
  expect(item.common.visibility_type).toBe(2);
  expect(item.declare).toBeUndefined();
});

it('does not submit after an upload failure and always disposes the isolated session', async () => {
  const { options, api, request, uploadImage } = fixture();
  uploadImage.mockRejectedValueOnce(
    new ArticleApiError('MEDIA_MISSING', '找不到图片，请重新选择'),
  );
  expect(await runDouyinGraphicPublish(options)).toMatchObject({
    ok: false,
    errorCode: 'MEDIA_MISSING',
  });
  expect(request).not.toHaveBeenCalled();
  expect(api.dispose).toHaveBeenCalledOnce();
});

it('stops before submission if cancelled during upload', async () => {
  const { options, api, request, uploadImage } = fixture();
  uploadImage.mockImplementationOnce(async () => {
    options.signal.cancelled = true;
    return {
      uri: 'one',
      url: 'https://images.example/one.png',
      width: 900,
      height: 1200,
      size: 10,
    };
  });
  expect(await runDouyinGraphicPublish(options)).toMatchObject({
    ok: false,
    errorCode: 'cancelled',
  });
  expect(request).not.toHaveBeenCalled();
  expect(api.dispose).toHaveBeenCalledOnce();
});

it('keeps a definite receipt even if cancellation arrives after submission', async () => {
  const { options, request } = fixture();
  request.mockImplementationOnce(async () => {
    options.signal.cancelled = true;
    return { status_code: 0, item_id: ID };
  });
  expect(await runDouyinGraphicPublish(options)).toMatchObject({
    ok: true,
    platformPostId: ID,
  });
});

it.each([{ status_code: 0 }, { status_code: 0, item_id: Number(ID) }, {}])(
  'does not invent a successful receipt: %j',
  async (response) => {
    const { options, request } = fixture();
    request.mockResolvedValueOnce(response);
    expect(await runDouyinGraphicPublish(options)).toMatchObject({
      ok: false,
      errorCode: 'PUBLISH_RESULT_UNKNOWN',
    });
    expect(request).toHaveBeenCalledOnce();
  },
);

it('never retries a disconnected submit and hides raw transport details', async () => {
  const { options, api, request } = fixture();
  request.mockRejectedValueOnce(new Error('Cookie secret'));
  const result = await runDouyinGraphicPublish(options);
  expect(result).toMatchObject({
    ok: false,
    errorCode: 'PUBLISH_RESULT_UNKNOWN',
  });
  expect(JSON.stringify(result)).not.toContain('secret');
  expect(request).toHaveBeenCalledOnce();
  expect(api.dispose).toHaveBeenCalledOnce();
});

it('keeps platform rejection distinct from expired login', async () => {
  const { options, request } = fixture();
  request.mockResolvedValueOnce({ status_code: 8 });
  expect(await runDouyinGraphicPublish(options)).toMatchObject({
    ok: false,
    errorCode: 'AUTH_EXPIRED',
  });
});
