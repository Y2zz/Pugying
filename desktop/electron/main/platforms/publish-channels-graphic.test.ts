import { ArticleApiError } from './article-api';
import type { ChannelsHttpTransport } from './channels-graphic-client';
import {
  channelsGraphicDescription,
  runChannelsGraphicPublish,
  type ChannelsGraphicPublishOptions,
} from './publish-channels-graphic';

vi.mock('electron', () => ({
  net: { fetch: vi.fn() },
  nativeImage: {
    createFromBuffer: () => ({
      getSize: () => ({ width: 800, height: 600 }),
    }),
  },
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(async () => Buffer.from('fake-image')),
  stat: vi.fn(async () => ({ isFile: () => true, size: 10 })),
}));

function jsonBody(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function fixture() {
  const calls: Array<{ url: string; method: string }> = [];
  const transport: ChannelsHttpTransport = {
    async request(options) {
      calls.push({ url: options.url, method: options.method });
      const url = options.url;
      if (url.includes('/auth/auth_data')) {
        return {
          status: 200,
          body: jsonBody({
            errCode: 0,
            data: { finderUser: { finderUsername: 'v2_finder@finder' } },
          }),
        };
      }
      if (url.includes('helper_upload_params')) {
        return {
          status: 200,
          body: jsonBody({
            errCode: 0,
            data: {
              authKey: 'auth-key',
              uin: 12345,
              appType: 251,
              pictureFileType: 20304,
              scene: 2,
            },
          }),
        };
      }
      if (url.includes('applyuploaddfs')) {
        return {
          status: 200,
          body: jsonBody({ UploadID: 'upload-1' }),
        };
      }
      if (url.includes('uploadpartdfs')) {
        return {
          status: 200,
          body: jsonBody({ ETag: '"etag-1"' }),
        };
      }
      if (url.includes('completepartuploaddfs')) {
        return {
          status: 200,
          body: jsonBody({
            DownloadURL: 'https://wxapp.tc.qq.com/pic/1.jpg',
          }),
        };
      }
      if (url.includes('get-finder-post-trace-key')) {
        return {
          status: 200,
          body: jsonBody({ errCode: 0, data: { traceKey: 'FPT_1' } }),
        };
      }
      if (url.includes('post_create')) {
        const body = JSON.parse(
          Buffer.from(options.body ?? []).toString('utf8'),
        ) as {
          objectDesc: { description: string; media: unknown[] };
        };
        expect(body.objectDesc.media).toHaveLength(2);
        expect(body.objectDesc.description).toContain('桌上留一点绿');
        return {
          status: 200,
          body: jsonBody({
            errCode: 0,
            data: {
              baseResp: { errcode: 0 },
              exportId: 'export/test-post-id',
            },
          }),
        };
      }
      if (url.includes('post_update_visible')) {
        const body = JSON.parse(
          Buffer.from(options.body ?? []).toString('utf8'),
        ) as { objectId: string; visibleType: number };
        expect(body).toMatchObject({
          objectId: 'export/test-post-id',
          visibleType: 3,
        });
        return {
          status: 200,
          body: jsonBody({
            errCode: 0,
            data: { errorCode: 0, msg: 'ok' },
          }),
        };
      }
      throw new Error(`unexpected url ${url}`);
    },
  };

  const options: ChannelsGraphicPublishOptions = {
    payload: {
      requestId: 'job',
      targetId: 'target',
      platform: 'channels',
      accountId: 'account',
      contentType: 'graphic',
      title: '桌上留一点绿',
      body: '给桌面留一点空。',
      mediaPaths: ['/tmp/one.png', '/tmp/two.png'],
      coverPath: '',
      cookies: [{ name: 'sessionid', value: 'abc' }],
      visibility: 'private',
      tags: ['日常'],
    },
    signal: { cancelled: false },
    onProgress: vi.fn(),
    transport,
  };
  return { options, calls, transport };
}

it('composes title, body and hash tags into the Channels description', () => {
  expect(channelsGraphicDescription('标题', '正文', ['日常', '#生活'])).toBe(
    '标题\n正文 #日常 #生活',
  );
});

it('uploads images then submits post_create, sets private visibility, and returns exportId', async () => {
  const { options, calls } = fixture();
  expect(await runChannelsGraphicPublish(options)).toMatchObject({
    ok: true,
    platformPostId: 'export/test-post-id',
  });
  expect(calls.some((call) => call.url.includes('applyuploaddfs'))).toBe(true);
  expect(calls.some((call) => call.url.includes('post_create'))).toBe(true);
  expect(calls.some((call) => call.url.includes('post_update_visible'))).toBe(
    true,
  );
  expect(options.onProgress).toHaveBeenCalledWith(
    expect.objectContaining({ phase: 'done' }),
  );
});

it('skips visibility update for public posts', async () => {
  const { options, calls } = fixture();
  options.payload.visibility = 'public';
  expect(await runChannelsGraphicPublish(options)).toMatchObject({ ok: true });
  expect(calls.some((call) => call.url.includes('post_update_visible'))).toBe(
    false,
  );
});

it('rejects unsupported visibility and schedules before contacting the platform', async () => {
  const { options, transport } = fixture();
  const spy = vi.spyOn(transport, 'request');
  options.payload.visibility = 'friends';
  expect(await runChannelsGraphicPublish(options)).toMatchObject({
    ok: false,
    errorCode: 'invalid_payload',
  });
  expect(spy).not.toHaveBeenCalled();
});

it('maps auth failures without exposing protocol details', async () => {
  const { options, transport } = fixture();
  transport.request = async () => ({
    status: 200,
    body: jsonBody({ errCode: 300004, errMsg: 'session expired' }),
  });
  const result = await runChannelsGraphicPublish(options);
  expect(result).toMatchObject({
    ok: false,
    errorCode: 'AUTH_EXPIRED',
  });
  expect(JSON.stringify(result)).not.toMatch(/300004|session expired/);
});

it('keeps a confirmed receipt when cancellation arrives during submission', async () => {
  const { options, transport } = fixture();
  const original = transport.request.bind(transport);
  transport.request = async (requestOptions) => {
    const response = await original(requestOptions);
    if (requestOptions.url.includes('post_create')) {
      options.signal.cancelled = true;
    }
    return response;
  };
  expect(await runChannelsGraphicPublish(options)).toMatchObject({
    ok: true,
    platformPostId: 'export/test-post-id',
  });
});

it('does not mark success when exportId is missing after submit', async () => {
  const { options, transport } = fixture();
  const original = transport.request.bind(transport);
  transport.request = async (requestOptions) => {
    if (requestOptions.url.includes('post_create')) {
      return {
        status: 200,
        body: jsonBody({
          errCode: 0,
          data: { baseResp: { errcode: 0 }, exportId: '' },
        }),
      };
    }
    return original(requestOptions);
  };
  expect(await runChannelsGraphicPublish(options)).toMatchObject({
    ok: false,
    errorCode: 'PUBLISH_RESULT_UNKNOWN',
  });
});

it('surfaces upload failures before submitting', async () => {
  const { options, transport } = fixture();
  const original = transport.request.bind(transport);
  transport.request = async (requestOptions) => {
    if (requestOptions.url.includes('applyuploaddfs')) {
      throw new ArticleApiError('PUBLISH_FAILED', '图片上传未成功，请稍后重试');
    }
    return original(requestOptions);
  };
  expect(await runChannelsGraphicPublish(options)).toMatchObject({
    ok: false,
    errorCode: 'PUBLISH_FAILED',
  });
});
