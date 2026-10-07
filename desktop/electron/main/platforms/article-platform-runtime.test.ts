import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import {
  DOUYIN_ARTICLE_RUNTIME,
  TOUTIAO_ARTICLE_RUNTIME,
  BILIBILI_ARTICLE_RUNTIME,
  TOUTIAO_GRAPHIC_RUNTIME,
  XIAOHONGSHU_GRAPHIC_RUNTIME,
} from './article-platform-runtime';
import { signBilibiliQuery } from './bilibili-wbi';

it('encodes micro posts as JSON text and preserves the exact large integer receipt', async () => {
  const post = vi.fn(async (_path, _data, config) =>
    config.transformResponse[0](
      '{"code":0,"data":{"threadId":7693773543242304768}}',
    ),
  );
  const window: any = { Garr: { network: { post, get: vi.fn() } } };
  expect(
    runInNewContext(TOUTIAO_GRAPHIC_RUNTIME, {
      window,
      location: { hostname: 'mp.toutiao.com' },
    }),
  ).toBe(true);
  expect(
    await window.__pugyingArticleApi.request('/mp/agw/article/wtt', {
      content: '标题\n文案',
      image_list: ['image/one'],
    }),
  ).toEqual({
    code: 0,
    data: { threadId: '7693773543242304768' },
  });
  expect(post.mock.calls[0][1]).toBe(
    '{"content":"标题\\n文案","image_list":["image/one"]}',
  );
  expect(post.mock.calls[0][2].headers).toEqual({
    'Content-Type': 'application/json; charset=utf-8',
  });
});

it('distinguishes an explicit micro post rejection from timeout uncertainty', async () => {
  const network = { post: vi.fn(), get: vi.fn() };
  const window: any = { Garr: { network } };
  runInNewContext(TOUTIAO_GRAPHIC_RUNTIME, {
    window,
    location: { hostname: 'mp.toutiao.com' },
  });
  network.post.mockRejectedValueOnce({ response: { status: 400 } });
  expect(
    await window.__pugyingArticleApi.request('/mp/agw/article/wtt', {}),
  ).toEqual({ code: 400 });
  const timeout = { response: { status: 408 } };
  network.post.mockRejectedValueOnce(timeout);
  await expect(
    window.__pugyingArticleApi.request('/mp/agw/article/wtt', {}),
  ).rejects.toBe(timeout);
});

it('uses the official Xiaohongshu API origin and separates business refusals from network uncertainty', async () => {
  const client = {
    get: vi.fn(),
    post: vi.fn().mockResolvedValue({
      code: 'N/A',
      success: true,
      data: { id: '6ac5d15f00000000140002c3' },
    }),
  };
  const modules = { 21069: { LV: client }, 69517: { d9: { post: vi.fn() } } };
  const require = Object.assign((id: number) => modules[id], { m: modules });
  const window: any = {
    webpackChunkugc: { push: ([, , callback]: any[]) => callback(require) },
  };
  expect(
    runInNewContext(XIAOHONGSHU_GRAPHIC_RUNTIME, {
      window,
      crypto: webcrypto,
      location: { hostname: 'creator.xiaohongshu.com' },
    }),
  ).toBe(true);
  expect(
    await window.__pugyingArticleApi.request('/web_api/sns/v2/note', {
      common: {},
    }),
  ).toMatchObject({ success: true });
  expect(client.post).toHaveBeenCalledWith(
    'https://edith.xiaohongshu.com/web_api/sns/v2/note',
    { common: {} },
    expect.objectContaining({ transform: false, extractData: false }),
  );
  client.post.mockRejectedValueOnce({
    name: 'HTTPBizError',
    data: { code: -9999 },
  });
  expect(
    await window.__pugyingArticleApi.request('/web_api/sns/v2/note', {}),
  ).toEqual({ code: -9999, success: false });
  const networkError = new Error('network unavailable');
  client.post.mockRejectedValueOnce(networkError);
  await expect(
    window.__pugyingArticleApi.request('/web_api/sns/v2/note', {}),
  ).rejects.toBe(networkError);
});

it('recognizes Douyin login without relying on a URL redirect', async () => {
  expect(
    await runInNewContext(DOUYIN_ARTICLE_RUNTIME, {
      window: {},
      location: { hostname: 'creator.douyin.com' },
      document: {
        readyState: 'complete',
        body: { innerText: '扫码登录 验证码登录 密码登录' },
      },
    }),
  ).toBe('AUTH_EXPIRED');
});

it.each(['global', 'micro'])(
  'uses the signed Douyin client and native uploader in the %s container',
  async (container) => {
    const client = {
      get: vi.fn(async () => ({ user: { uid: '123' } })),
      post: vi.fn(async () => ({ data: { status_code: 0, item_id: '123' } })),
    };
    const uploadFile = vi.fn(async () => ({
      uri: 'tos/image',
      imageWidth: 1200,
      imageHeight: 900,
    }));
    const Uploader = vi.fn(function () {
      return { uploadFile };
    });
    const modules = {
      56211: { A: client },
      64477: { A: Uploader },
      70858: { sW: vi.fn(async () => 'https://image.example/x.png') },
    };
    const require = Object.assign((id: number) => modules[id], { m: modules });
    const window: any = {
      webpackChunkdouyin_creator_content: {
        push: ([, , callback]: any[]) => callback(require),
      },
    };
    if (container === 'micro') {
      window.Gar = {
        cacheApps: {
          article: {
            vmSandbox: {
              global: {
                webpackChunkdouyin_creator_content:
                  window.webpackChunkdouyin_creator_content,
              },
            },
          },
        },
      };
      delete window.webpackChunkdouyin_creator_content;
    }
    expect(
      await runInNewContext(DOUYIN_ARTICLE_RUNTIME, {
        window,
        crypto: webcrypto,
        location: { hostname: 'creator.douyin.com' },
      }),
    ).toBe(true);
    expect(
      await window.__pugyingArticleApi.request(
        '/web/api/media/aweme/create_v2/',
        { item: {} },
      ),
    ).toEqual({ status_code: 0, item_id: '123' });
    expect(client.post).toHaveBeenCalledWith(
      '/web/api/media/aweme/create_v2/',
      { item: {} },
      expect.objectContaining({
        needSign: true,
        retries: 0,
        withSecondVerify: true,
        returnRaw: true,
        params: { read_aid: 2906 },
      }),
    );
    expect(
      await window.__pugyingArticleApi.upload({ size: 1024 }),
    ).toMatchObject({
      uri: 'tos/image',
      width: 1200,
      height: 900,
      url: 'https://image.example/x.png',
      size: 1,
    });
    expect(Uploader).toHaveBeenCalledWith({ type: 'image' }, {}, '123');
  },
);

it('fails closed when Douyin changes its module contract', async () => {
  const window = {
    webpackChunkdouyin_creator_content: {
      push: ([, , callback]: any[]) =>
        callback(Object.assign(() => ({}), { m: {} })),
    },
  };
  expect(
    await runInNewContext(DOUYIN_ARTICLE_RUNTIME, {
      window,
      crypto: webcrypto,
      location: { hostname: 'creator.douyin.com' },
    }),
  ).toBe(false);
});

it('rechecks Douyin after its lazy uploader chunk finishes loading', async () => {
  const loaded = new Set<string>();
  const modules: Record<number, unknown> = {
    56211: { A: { get: vi.fn(), post: vi.fn() } },
    70858: { sW: vi.fn() },
  };
  const require = Object.assign((id: number) => modules[id], {
    m: modules,
    e: vi.fn(async () => {
      modules[64477] = { A: vi.fn() };
    }),
  });
  const window = {
    webpackChunkdouyin_creator_content: {
      push: ([[id], , callback]: any[]) => {
        if (!loaded.has(id)) {
          loaded.add(id);
          callback(require);
        }
      },
    },
  };
  const context = {
    window,
    crypto: webcrypto,
    location: { hostname: 'creator.douyin.com' },
  };
  expect(await runInNewContext(DOUYIN_ARTICLE_RUNTIME, context)).toBe(false);
  expect(require.e).toHaveBeenCalledWith(6285);
  expect(await runInNewContext(DOUYIN_ARTICLE_RUNTIME, context)).toBe(true);
});

it('uses Toutiao native network and image multipart field, with reward preflight', async () => {
  const fetch = vi.fn(async () => ({
    ok: true,
    text: async () => '{"code":0,"data":{"pgc_id":7561234567890123456}}',
  }));
  const network = {
    get: vi.fn(async () => ({ code: 0 })),
    post: vi.fn(async () => ({
      code: 0,
      data: {
        origin_image_uri: 'uri',
        origin_image_url: 'https://image.example/a.png',
        image_width: 100,
        image_height: 200,
      },
    })),
  };
  const window: any = {
    Garr: {
      network,
      pgc_info: { creator_project_info: { praise_count_remained: 2 } },
    },
    byted_acrawler: { init: vi.fn() },
  };
  expect(
    runInNewContext(TOUTIAO_ARTICLE_RUNTIME, {
      window,
      location: { hostname: 'mp.toutiao.com' },
      FormData,
      fetch,
    }),
  ).toBe(true);
  expect(
    await window.__pugyingArticleApi.request(
      '/mp/agw/article/new?article_type=0',
    ),
  ).toMatchObject({ code: 0, __pugyingRewardRemaining: 2 });
  await window.__pugyingArticleApi.upload(new File(['png'], 'a.png'));
  const [path, data, config] = network.post.mock.calls[0] as any;
  expect(path).toBe(
    '/spice/image?upload_source=20020003&aid=1231&device_platform=web',
  );
  expect(data.get('image').name).toBe('a.png');
  expect(config.headers['Content-Type']).toBe('multipart/form-data');
  const submitted = await window.__pugyingArticleApi.request(
    '/mp/agw/article/publish',
    {
      title: '标题 & 内容',
      save: 1,
      pgc_id: '',
    },
  );
  expect(submitted.data.pgc_id).toBe('7561234567890123456');
  expect(fetch).toHaveBeenCalledWith(
    '/mp/agw/article/publish',
    expect.objectContaining({
      method: 'POST',
      credentials: 'same-origin',
      body: 'title=%E6%A0%87%E9%A2%98%20%26%20%E5%86%85%E5%AE%B9&save=1&pgc_id=',
    }),
  );
  expect(window.byted_acrawler.init).toHaveBeenCalledWith(
    expect.objectContaining({
      aid: 1231,
      enablePathList: ['/mp/agw/article/publish'],
    }),
  );
});

it('Bilibili includes the account CSRF field with the uploaded file', async () => {
  const fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      code: 0,
      data: {
        image_url: 'https://image.example/a.png',
        image_width: 1200,
        image_height: 800,
      },
    }),
  }));
  const window: any = {};
  runInNewContext(BILIBILI_ARTICLE_RUNTIME, {
    window,
    fetch,
    document: { querySelector: () => ({ content: '333.1339' }) },
    FormData,
    location: { hostname: 'member.bilibili.com' },
  });
  await window.__pugyingArticleApi.upload(
    new File(['png'], 'a.png'),
    'w_rid=sign',
    'csrf-token',
  );
  const [url, options] = fetch.mock.calls[0] as any;
  expect(url).toContain('/upload_bfs?w_rid=sign');
  expect(options.body.get('csrf')).toBe('csrf-token');
  expect(options.body.get('file_up').name).toBe('a.png');
});

it('Bilibili sends cookies, preserves big IDs and uses the actual risk SDK token', async () => {
  const fetch = vi.fn(async () => ({
    ok: true,
    headers: { get: () => null },
    text: async () =>
      '{"code":0,"data":{"dyn_id_str":"7561234567890123456","id":7561234567890123456}}',
  }));
  const window: any = {
    SecureCollectSDK: { getEnvToken: vi.fn(async () => 'signed-token') },
    __riskUserLogConfig__: { payload_log: '0' },
    _render_data_: { access_id: 'web-id' },
  };
  runInNewContext(BILIBILI_ARTICLE_RUNTIME, {
    window,
    fetch,
    document: { querySelector: () => ({ content: '333.1339' }) },
    location: { hostname: 'member.bilibili.com' },
  });
  const result = await window.__pugyingArticleApi.request(
    '/x/dynamic/feed/create/opus?csrf=test&w_rid=sign',
    { opus_req: {} },
  );
  expect(result.data.id).toBe('7561234567890123456');
  expect(fetch).toHaveBeenCalledWith(
    'https://api.bilibili.com/x/dynamic/feed/create/opus?csrf=test&w_rid=sign',
    expect.objectContaining({
      credentials: 'include',
      method: 'POST',
      body: '{"opus_req":{}}',
      redirect: 'error',
    }),
  );
  expect(await window.__pugyingArticleApi.riskParams()).toMatchObject({
    b_wet: 'signed-token',
    dm_img_switch: '0',
  });
  expect(window.SecureCollectSDK.getEnvToken).toHaveBeenCalledWith(false);
  expect(window.__pugyingArticleApi.wbiParams()).toMatchObject({
    w_webid: 'web-id',
  });
  expect(
    JSON.parse(
      window.__pugyingArticleApi.wbiParams()['x-bili-device-req-json'],
    ),
  ).toMatchObject({ spmid: '333.1339', mobi_app: 'web_cn' });
});

it('WBI matches the reference keys and timestamp', () => {
  const query = signBilibiliQuery(
    { foo: '114', bar: '514', baz: '1919810' },
    '7cd084941338484aae1ad9425b84077c',
    '4932caff0ff746eab6f01bf08b70ac45',
    1702204169000,
  );
  expect(query).toBe(
    'bar=514&baz=1919810&foo=114&wts=1702204169&w_rid=6149fdadf571698ca7e6a567265cd0ee',
  );
});

it('uses the official video uploader, reports progress and retains only upload metadata', async () => {
  const client = {
    get: vi.fn(async () => ({ user: { uid: '123' } })),
    post: vi.fn(),
  };
  const cancel = vi.fn();
  const uploadFile = vi.fn(async (_file, progress) => {
    progress(42.5);
    return {
      vid: 'v-real',
      duration: 8,
      width: 720,
      height: 960,
      coverUri: 'video/frame',
      file: { private: true },
    };
  });
  const Uploader = vi.fn(function () {
    return { uploadFile, cancel };
  });
  const modules = {
    56211: { A: client },
    64477: { A: Uploader },
    70858: { sW: vi.fn() },
  };
  const require = Object.assign((id: number) => modules[id], { m: modules });
  const window: any = {
    webpackChunkdouyin_creator_content: {
      push: ([, , callback]: any[]) => callback(require),
    },
  };
  await runInNewContext(DOUYIN_ARTICLE_RUNTIME, {
    window,
    crypto: webcrypto,
    location: { hostname: 'creator.douyin.com' },
  });
  expect(await window.__pugyingArticleApi.uploadVideo({ size: 1024 })).toEqual({
    vid: 'v-real',
    duration: 8,
    width: 720,
    height: 960,
    coverUri: 'video/frame',
  });
  expect(Uploader).toHaveBeenCalledWith({ type: 'video' }, {}, '123');
  expect(window.__pugyingVideoProgress).toBe(100);
  expect(cancel).toHaveBeenCalledOnce();
});

it('waits for cloud conversion rather than submitting a video with incomplete metadata', async () => {
  const client = {
    get: vi
      .fn()
      .mockResolvedValueOnce({ user: { uid: '123' } })
      .mockResolvedValueOnce({ status_code: 0 })
      .mockResolvedValueOnce({ status_code: 0, encode: 0 })
      .mockResolvedValueOnce({
        status_code: 0,
        encode: 1,
        duration: 8,
        width: '720',
        height: '960',
        poster_uri: 'video/frame',
      }),
    post: vi.fn(),
  };
  const cancel = vi.fn();
  const Uploader = vi.fn(function () {
    return {
      uploadFile: async () => ({
        vid: 'v-real',
        duration: 0,
        shouldConvert: true,
      }),
      cancel,
    };
  });
  const modules = {
    56211: { A: client },
    64477: { A: Uploader },
    70858: { sW: vi.fn() },
  };
  const require = Object.assign((id: number) => modules[id], { m: modules });
  const window: any = {
    webpackChunkdouyin_creator_content: {
      push: ([, , callback]: any[]) => callback(require),
    },
  };
  await runInNewContext(DOUYIN_ARTICLE_RUNTIME, {
    window,
    crypto: webcrypto,
    setTimeout: (callback: () => void) => callback(),
    location: { hostname: 'creator.douyin.com' },
  });
  expect(await window.__pugyingArticleApi.uploadVideo({})).toEqual({
    vid: 'v-real',
    duration: 8,
    width: 720,
    height: 960,
    coverUri: 'video/frame',
  });
  expect(client.get).toHaveBeenCalledTimes(4);
  expect(client.get).toHaveBeenNthCalledWith(
    2,
    '/web/api/media/video/enable/',
    expect.objectContaining({ params: { video_id: 'v-real' }, retries: 0 }),
  );
  expect(client.get).toHaveBeenLastCalledWith(
    '/web/api/media/video/transend/',
    expect.objectContaining({ params: { video_id: 'v-real' }, retries: 0 }),
  );
  expect(cancel).toHaveBeenCalledOnce();
});
