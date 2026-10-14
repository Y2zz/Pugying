import { ArticleApiError } from './article-api';
import {
  channelsVideoDescription,
  runChannelsVideoPublish,
  type ChannelsVideoPublishOptions,
} from './publish-channels-video';

vi.mock('electron', () => ({
  net: { fetch: vi.fn() },
  nativeImage: {
    createFromBuffer: () => ({
      getSize: () => ({ width: 800, height: 1066 }),
    }),
  },
}));

function fixture(
  overrides: Partial<ChannelsVideoPublishOptions['payload']> = {},
) {
  const client = {
    prepare: vi.fn(async () => undefined),
    getFinderId: () => 'v2_finder@finder',
    uploadVideo: vi.fn(async () => ({
      url: 'https://wxapp.tc.qq.com/video.mp4',
      width: 1280,
      height: 720,
      duration: 2,
      durationSec: 2,
      size: 1024,
      md5sum: 'video-md5',
    })),
    uploadImage: vi.fn(async () => ({
      url: 'https://wxapp.tc.qq.com/cover.jpg',
      width: 800,
      height: 1066,
      size: 10,
      md5sum: 'cover-md5',
    })),
    getTraceKey: vi.fn(async () => 'FPT_1'),
    postClipVideo: vi.fn(async () => 'clip-key-1'),
    postCreateVideo: vi.fn(async () => 'export/video-post-id'),
    updateVisible: vi.fn(async () => undefined),
  };

  const options: ChannelsVideoPublishOptions = {
    payload: {
      requestId: 'job',
      targetId: 'target',
      platform: 'channels',
      accountId: 'account',
      contentType: 'video',
      title: '短视频对接探测',
      body: '仅自己可见试发。',
      mediaPath: '/tmp/demo.mp4',
      coverPath: '/tmp/cover.jpg',
      cookies: [{ name: 'sessionid', value: 'abc' }],
      visibility: 'private',
      tags: ['蒲公英'],
      ...overrides,
    },
    signal: { cancelled: false },
    onProgress: vi.fn(),
    createClient: () => client as never,
  };
  return { options, client };
}

it('composes body and hash tags into the Channels video description', () => {
  expect(channelsVideoDescription('简介', ['日常', '#生活'])).toBe(
    '简介 #日常 #生活',
  );
});

it('uploads video and cover, clips, creates, sets private, returns exportId', async () => {
  const { options, client } = fixture();
  expect(await runChannelsVideoPublish(options)).toMatchObject({
    ok: true,
    platformPostId: 'export/video-post-id',
  });
  expect(client.uploadVideo).toHaveBeenCalled();
  expect(client.uploadImage).toHaveBeenCalled();
  expect(client.postClipVideo).toHaveBeenCalled();
  expect(client.postCreateVideo).toHaveBeenCalledWith(
    expect.objectContaining({
      shortTitle: '短视频对接探测',
      clipKey: 'clip-key-1',
    }),
  );
  expect(client.updateVisible).toHaveBeenCalledWith(
    'export/video-post-id',
    3,
  );
  expect(options.onProgress).toHaveBeenCalledWith(
    expect.objectContaining({ phase: 'done' }),
  );
});

it('skips visibility update for public posts', async () => {
  const { options, client } = fixture({ visibility: 'public' });
  expect(await runChannelsVideoPublish(options)).toMatchObject({ ok: true });
  expect(client.updateVisible).not.toHaveBeenCalled();
});

it('rejects short titles outside 6-16 chars before contacting the platform', async () => {
  const { options, client } = fixture({ title: '短' });
  expect(await runChannelsVideoPublish(options)).toMatchObject({
    ok: false,
    errorCode: 'invalid_payload',
  });
  expect(client.prepare).not.toHaveBeenCalled();
});

it('rejects missing cover and schedules', async () => {
  const { options, client } = fixture({
    coverPath: '',
    coverLandscapePath: '',
  });
  expect(await runChannelsVideoPublish(options)).toMatchObject({
    ok: false,
    errorCode: 'invalid_payload',
  });
  options.payload.coverPath = '/tmp/cover.jpg';
  options.payload.scheduledAt = new Date(Date.now() + 3600000).toISOString();
  expect(await runChannelsVideoPublish(options)).toMatchObject({
    ok: false,
    errorCode: 'invalid_payload',
  });
  expect(client.prepare).not.toHaveBeenCalled();
});

it('marks result unknown when create throws after submit', async () => {
  const { options, client } = fixture();
  client.postCreateVideo.mockRejectedValueOnce(
    new ArticleApiError(
      'PUBLISH_RESULT_UNKNOWN',
      '尚未确认发布结果，请先到平台查看',
    ),
  );
  expect(await runChannelsVideoPublish(options)).toMatchObject({
    ok: false,
    errorCode: 'PUBLISH_RESULT_UNKNOWN',
  });
});
