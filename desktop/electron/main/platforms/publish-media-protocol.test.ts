import {
  createPublishMediaChannel,
  registerPublishMediaScheme,
} from './publish-media-protocol';
const mock = vi.hoisted(() => ({
  fetch: vi.fn(async () => new Response('video')),
  register: vi.fn(),
}));
vi.mock('electron', () => ({
  net: { fetch: mock.fetch },
  protocol: { registerSchemesAsPrivileged: mock.register },
}));

beforeEach(() => {
  mock.fetch.mockClear();
});

it('registers only the streaming fetch capabilities needed by the isolated media channel', () => {
  registerPublishMediaScheme();
  expect(mock.register).toHaveBeenCalledWith([
    {
      scheme: 'pugying-publish-media',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
});

it.each([
  'https://creator.xiaohongshu.com',
  'https://mp.toutiao.com',
  'https://member.bilibili.com',
  'https://channels.weixin.qq.com',
] as const)(
  'isolates local video access to the selected platform %s',
  async (origin) => {
    const protocol = { handle: vi.fn(), unhandle: vi.fn() };
    const channel = createPublishMediaChannel({ protocol } as any, origin);
    const url = channel.expose('/tmp/selected-video.mp4');
    const handler = protocol.handle.mock.calls[0][1];
    const request = { url, method: 'GET', initiatorOrigin: origin };
    const response = await handler(request);
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    expect(
      (
        await handler({
          ...request,
          initiatorOrigin: 'https://creator.douyin.com',
        })
      ).status,
    ).toBe(403);
    channel.dispose();
  },
);

it('serves only this task video to the creator origin and closes access on dispose', async () => {
  const protocol = { handle: vi.fn(), unhandle: vi.fn() };
  const channel = createPublishMediaChannel({ protocol } as any);
  const file = { url: channel.expose('/tmp/selected video.mp4') };
  const handler = protocol.handle.mock.calls[0][1];
  const valid = {
    url: file.url,
    method: 'GET',
    initiatorOrigin: 'https://creator.douyin.com',
    // Chromium 的自定义协议请求没有 Origin header，须使用真实 initiator。
    headers: new Headers(),
  };
  const response = await handler(valid);
  expect(await response.text()).toBe('video');
  expect(mock.fetch).toHaveBeenCalledWith('file:///tmp/selected%20video.mp4');
  for (const request of [
    { ...valid, url: file.url + '?path=/etc/passwd' },
    { ...valid, method: 'POST' },
    { ...valid, initiatorOrigin: 'https://evil.example' },
    { ...valid, initiatorOrigin: undefined },
  ]) {
    expect((await handler(request)).status).toBe(403);
  }
  expect(mock.fetch).toHaveBeenCalledOnce();
  channel.revoke();
  expect((await handler(valid)).status).toBe(403);
  channel.dispose();
  expect(protocol.unhandle).toHaveBeenCalledWith('pugying-publish-media');
});
