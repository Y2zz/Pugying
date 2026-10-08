import { prepareArticleDocument } from '../article-publish-format';
import {
  ArticleApiError,
  articlePostId,
  assertArticleResponse,
  type ArticleApiSession,
  type ArticlePublishOptions,
} from './article-api';
import { runDouyinArticlePublish } from './publish-douyin-article';
import { runToutiaoArticlePublish } from './publish-toutiao-article';
import { runBilibiliArticlePublish } from './publish-bilibili-article';

const ID = '7561234567890123456';
it('does not misclassify Toutiao invalid parameters as an expired login', () => {
  expect(() => assertArticleResponse({ code: 1001 }, 'toutiao')).toThrow(
    expect.objectContaining({ code: 'PLATFORM_REJECTED' }),
  );
});
function fixture(platform: string) {
  const request = vi.fn(
    async (
      path: string,
      data?: Record<string, unknown>,
    ): Promise<Record<string, unknown>> => {
      if (data) {
        return platform === 'douyin'
          ? { status_code: 0, item_id: ID }
          : {
              code: 0,
              data:
                platform === 'toutiao' ? { pgc_id: ID } : { dyn_id_str: ID },
            };
      }
      if (path.includes('challengesug')) {
        return {
          status_code: 0,
          sug_list: [{ cha_name: '测试', cid: '9876' }],
        };
      }
      if (path.includes('strategy')) {
        return {
          err_no: 0,
          exclusive: { has_permission: true },
          tuwen_wtt_transfer: {
            short: { min: 0, max: 1000, tuwen_wtt_trans_flag: '1' },
          },
        };
      }
      if (path.includes('/nav')) {
        return { code: 0, data: { isLogin: true, mid: 123 } };
      }
      return {
        code: 0,
        __pugyingRewardRemaining: 1,
        data: { config: { max_title_len: 40 }, verify: {} },
      };
    },
  );
  const api: ArticleApiSession = {
    request,
    uploadImage: vi.fn(async (path) => ({
      url: `https://images.example/${path.split('/').pop()}`,
      uri: `uri-${path.split('/').pop()}`,
      width: 1200,
      height: 800,
      size: 10,
    })),
    dispose: vi.fn(async () => {}),
  };
  const options: ArticlePublishOptions = {
    payload: {
      requestId: 'job',
      targetId: 'target',
      platform,
      accountId: 'account',
      title: '测试文章',
      contentType: 'article',
      coverPath: '/tmp/cover.png',
      cookies: [
        {
          name: 'session',
          value: 'private-cookie',
          domain: `.${platform}.com`,
        },
      ],
    },
    article: prepareArticleDocument(
      `<h2>标题</h2><p>${'正文'.repeat(60)}<strong>加粗</strong><a href="https://example.com">链接</a></p><figure data-article-image><img data-local-path="/tmp/body.png" src="file:///tmp/body.png" alt="说明"><figcaption>图注</figcaption></figure><ol><li><p>第一条</p></li></ol><pre><code>const x = 1;</code></pre>`,
      ['/tmp/body.png'],
    ),
    signal: { cancelled: false },
    onProgress: vi.fn(),
    createSession: vi.fn(async () => api),
  };
  return { api, request, options };
}
const runners = {
  douyin: runDouyinArticlePublish,
  toutiao: runToutiaoArticlePublish,
  bilibili: runBilibiliArticlePublish,
};

it('submits Douyin article Markdown with uploaded URIs, visibility, summary and topic offsets', async () => {
  const { api, request, options } = fixture('douyin');
  options.payload.articleSettings = { summary: '摘要' };
  options.payload.tags = ['测试'];
  options.payload.visibility = 'friends';
  expect(await runDouyinArticlePublish(options)).toMatchObject({
    ok: true,
    platformPostId: ID,
  });
  const createCall = request.mock.calls.find(([path]) =>
    String(path).includes('create_v2'),
  ) as [string, any];
  expect(createCall[0]).toBe('/web/api/media/aweme/create_v2/');
  const body = createCall[1];
  expect(body.item.common).toMatchObject({
    media_type: 43,
    long_article_version: '1',
    text: '测试文章 #测试',
    description: '摘要',
    visibility_type: 2,
    timing: -1,
  });
  expect(body.item.common.long_article).toContain(
    '![说明](uri-body.png "图注")',
  );
  expect(body.item.common.long_article_image_info).toEqual([
    {
      key: 'uri-body.png',
      value: {
        url: 'https://images.example/body.png',
        width: 1200,
        height: 800,
      },
    },
  ]);
  expect(JSON.parse(body.item.common.text_extra)[1]).toMatchObject({
    start: 5,
    end: 8,
    caption_start: 0,
    caption_end: 3,
    hashtag_id: '9876',
    hashtag_name: '测试',
  });
  expect(body.item.cover.poster).toBe('uri-cover.png');
  expect(JSON.stringify(body)).not.toMatch(/file:|data-local|private-cookie/);
  expect(api.dispose).toHaveBeenCalledOnce();
});

it('uses saved Douyin topic resource ids without searching again', async () => {
  const { api, request, options } = fixture('douyin');
  options.payload.articleSettings = { summary: '摘要' };
  options.payload.topicRefs = [{ id: '555', name: '绑定话题' }];
  options.payload.visibility = 'private';
  expect(await runDouyinArticlePublish(options)).toMatchObject({ ok: true });
  expect(
    request.mock.calls.some(([path]) => String(path).includes('challengesug')),
  ).toBe(false);
  const createCall = request.mock.calls.find(([path]) =>
    String(path).includes('create_v2'),
  ) as [string, any];
  expect(JSON.parse(createCall[1].item.common.text_extra)[1]).toMatchObject({
    hashtag_id: '555',
    hashtag_name: '绑定话题',
  });
  expect(api.dispose).toHaveBeenCalledOnce();
});

it.each(['single', 'triple', 'none'] as const)(
  'submits Toutiao with %s covers, publish save=1 and account settings',
  async (coverMode) => {
    const { api, request, options } = fixture('toutiao');
    options.payload.articleSettings = {
      coverMode,
      advertisement: true,
      exclusive: true,
      declarations: ['ai'],
    };
    options.payload.articleCoverPaths =
      coverMode === 'triple'
        ? ['/tmp/cover.png', '/tmp/cover2.png', '/tmp/cover3.png']
        : coverMode === 'single'
          ? ['/tmp/cover.png']
          : [];
    expect(await runToutiaoArticlePublish(options)).toMatchObject({
      ok: true,
      platformPostId: ID,
    });
    const calls = request.mock.calls.filter((call) => call[1]);
    expect(calls).toHaveLength(1);
    const [path, body] = calls[0] as [string, any];
    expect(path).toContain('/mp/agw/article/publish?');
    expect(body).toMatchObject({
      save: 1,
      entrance: 'main',
      article_type: 0,
      article_ad_type: 3,
      claim_exclusive: 1,
      praise: 1,
      disable_praise: 0,
    });
    expect(JSON.parse(body.pgc_feed_covers)).toHaveLength(
      coverMode === 'triple' ? 3 : coverMode === 'single' ? 1 : 0,
    );
    expect(JSON.parse(body.draft_form_data).coverType).toBe(
      coverMode === 'triple' ? 3 : coverMode === 'single' ? 2 : 1,
    );
    expect(JSON.parse(body.extra)).toMatchObject({
      tuwen_wtt_trans_flag: '1',
      info_source: { source_type: 3 },
    });
    expect(body.content).toContain('web_uri="uri-body.png"');
    expect(body.content).not.toMatch(/file:|data-local/);
    expect(api.dispose).toHaveBeenCalledOnce();
  },
);

it('uses Bilibili opus structured paragraphs and preserves comment, originality, cover, and visibility settings', async () => {
  const { request, options } = fixture('bilibili');
  options.payload.articleSettings = {
    comments: 'selected',
    original: true,
    customCover: true,
  };
  options.payload.visibility = 'private';
  expect(await runBilibiliArticlePublish(options)).toMatchObject({
    ok: true,
    platformPostId: ID,
    platformUrl: `https://www.bilibili.com/opus/${ID}`,
  });
  const [path, body] = request.mock.calls.find((call) => call[1]) as [
    string,
    any,
  ];
  expect(path).toBe('/x/dynamic/feed/create/opus');
  expect(body.opus_req.opus.article).toMatchObject({
    category_id: 15,
    list_id: 0,
    originality: 1,
    reproduced: 0,
    cover: [{ url: 'https://images.example/cover.png' }],
  });
  expect(body.opus_req.option).toMatchObject({
    close_comment: 0,
    up_choose_comment: 1,
    private_pub: 1,
  });
  expect(
    body.opus_req.opus.content.paragraphs.map((p: any) => p.para_type),
  ).toEqual([9, 1, 2, 5, 8]);
  expect(body.opus_req.opus.content.paragraphs[2].pic.pics[0].comment).toBe(
    '图注',
  );
});

it.each(Object.keys(runners) as (keyof typeof runners)[])(
  '%s never succeeds without an authoritative post ID and never repeats submission',
  async (platform) => {
    const { api, request, options } = fixture(platform);
    const original = request.getMockImplementation()!;
    request.mockImplementation((path, data) =>
      data
        ? Promise.resolve(
            platform === 'douyin' ? { status_code: 0 } : { code: 0, data: {} },
          )
        : original(path, data),
    );
    expect(await runners[platform](options)).toMatchObject({
      ok: false,
      errorCode: 'PUBLISH_RESULT_UNKNOWN',
    });
    expect(request.mock.calls.filter((call) => call[1])).toHaveLength(1);
    expect(api.dispose).toHaveBeenCalledOnce();
  },
);

it('rejects rounded numeric IDs instead of storing the wrong article', () => {
  expect(() => articlePostId(Number(ID))).toThrow();
  expect(articlePostId(ID)).toBe(ID);
});

it('stops on cancellation during upload and releases the session', async () => {
  const { api, request, options } = fixture('douyin');
  vi.mocked(api.uploadImage).mockImplementationOnce(async () => {
    options.signal.cancelled = true;
    return {
      url: 'https://img.example/x.png',
      uri: 'uri',
      width: 1,
      height: 1,
      size: 1,
    };
  });
  expect(await runDouyinArticlePublish(options)).toMatchObject({
    ok: false,
    errorCode: 'cancelled',
  });
  expect(request).not.toHaveBeenCalled();
  expect(api.dispose).toHaveBeenCalledOnce();
});

it('preserves a successful commit received after cancellation', async () => {
  const { request, options } = fixture('douyin');
  request.mockImplementationOnce(async () => {
    options.signal.cancelled = true;
    return { status_code: 0, item_id: ID };
  });
  expect(await runDouyinArticlePublish(options)).toMatchObject({
    ok: true,
    platformPostId: ID,
  });
});

it.each([{ declarations: ['internet', 'ai'] }, { declarations: ['platform'] }])(
  'does not silently drop unsupported Toutiao declarations',
  async (settings) => {
    const { api, request, options } = fixture('toutiao');
    options.payload.articleSettings = settings as any;
    expect(await runToutiaoArticlePublish(options)).toMatchObject({
      ok: false,
      errorCode: 'ARTICLE_SETTINGS_UNSUPPORTED',
    });
    expect(request).not.toHaveBeenCalled();
    expect(api.uploadImage).not.toHaveBeenCalled();
  },
);

it('does not enable Toutiao reward when its daily quota is exhausted', async () => {
  const { api, request, options } = fixture('toutiao');
  request.mockResolvedValueOnce({ code: 0, __pugyingRewardRemaining: 0 });
  expect(await runToutiaoArticlePublish(options)).toMatchObject({
    ok: false,
    errorCode: 'ARTICLE_SETTINGS_UNAVAILABLE',
  });
  expect(api.uploadImage).not.toHaveBeenCalled();
});

it('writes the selected Bilibili anthology id into list_id', async () => {
  const { request, options } = fixture('bilibili');
  options.payload.anthologyRef = { id: '88', name: '旅行笔记' };
  expect(await runBilibiliArticlePublish(options)).toMatchObject({ ok: true });
  const [, body] = request.mock.calls.find((call) => call[1]) as [
    string,
    { opus_req: { opus: { article: { list_id: number } } } },
  ];
  expect(body.opus_req.opus.article.list_id).toBe(88);
});

it('stops a Bilibili article before uploading when the daily publication limit is reached', async () => {
  const { api, request, options } = fixture('bilibili');
  request.mockResolvedValueOnce({
    code: 0,
    data: { verify: { post_count_exceeded: { result: 1 } } },
  });
  expect(await runBilibiliArticlePublish(options)).toMatchObject({
    ok: false,
    errorCode: 'ARTICLE_PUBLISH_LIMIT_REACHED',
    error: '今日投稿次数已用完，请额度恢复后重试',
  });
  expect(api.uploadImage).not.toHaveBeenCalled();
  expect(request).toHaveBeenCalledOnce();
});

it('does not apply the Bilibili edit limit to a new article', async () => {
  const { request, options } = fixture('bilibili');
  request.mockResolvedValueOnce({
    code: 0,
    data: {
      verify: {
        edit_count_exceeded: { result: 1 },
        post_count_exceeded: { result: 0 },
      },
    },
  });
  expect(await runBilibiliArticlePublish(options)).toMatchObject({ ok: true });
  expect(
    request.mock.calls.some(
      ([path, data]) => path === '/x/dynamic/feed/create/opus' && !!data,
    ),
  ).toBe(true);
});

it('keeps unknown commit failures nonretrying and hides raw exceptions', async () => {
  const { request, options } = fixture('douyin');
  request.mockRejectedValueOnce(
    new ArticleApiError('PUBLISH_RESULT_UNKNOWN', '尚未确认发布结果'),
  );
  expect(await runDouyinArticlePublish(options)).toMatchObject({
    ok: false,
    errorCode: 'PUBLISH_RESULT_UNKNOWN',
  });
  expect(request).toHaveBeenCalledOnce();
  request.mockRejectedValueOnce(new Error('Cookie: private-cookie'));
  expect(await runDouyinArticlePublish(options)).not.toHaveProperty(
    'error',
    expect.stringContaining('private-cookie'),
  );
});
