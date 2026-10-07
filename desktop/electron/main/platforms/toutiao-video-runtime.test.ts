import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import { TOUTIAO_VIDEO_UPLOAD_RUNTIME } from './toutiao-video-runtime';

function fixture(micro = false) {
  const callbacks: Record<string, (event: unknown) => void> = {};
  const uploader = {
    on: vi.fn((event, callback) => {
      callbacks[event] = callback;
    }),
    start: vi.fn(),
  };
  const factory = vi.fn(async () => uploader);
  const require = Object.assign(() => ({ Z: factory }), { m: { 36758: {}, 7234: {}, 14562: {} } });
  const window: any = { '@mp/xigua:1.0.0.3998': {} };
  window['@mp/xigua:1.0.0.3998'] = [];
  window['@mp/xigua:1.0.0.3998'].push = (chunk: any) => chunk[2](require);
  if (micro) {
    window.Garfish = {
      apps: {
        xigua: {
          vmSandbox: {
            global: { '@mp/xigua:1.0.0.3998': window['@mp/xigua:1.0.0.3998'] },
          },
        },
      },
    };
    delete window['@mp/xigua:1.0.0.3998'];
  }
  const ready = runInNewContext(TOUTIAO_VIDEO_UPLOAD_RUNTIME, {
    window,
    location: { hostname: 'mp.toutiao.com' },
    crypto: webcrypto,
  });
  return { window, callbacks, factory, uploader, ready };
}

it('uses the official video factory and its STS mode, preserving the upload receipt', async () => {
  const { window, callbacks, factory, uploader, ready } = fixture();
  expect(ready).toBe(true);
  const file = { name: 'video.mp4' };
  const upload = window.__pugyingToutiaoVideoUpload(file);
  await vi.waitFor(() => expect(uploader.start).toHaveBeenCalledOnce());
  expect(factory).toHaveBeenCalledWith(
    file,
    'video',
    undefined,
    undefined,
    true,
  );
  expect(uploader.start).toHaveBeenCalledOnce();
  callbacks.progress({ percent: 62 });
  expect(window.__pugyingVideoProgress).toBe(62);
  callbacks.complete({
    uploadResult: { Vid: 'v123abc', Meta: { Duration: 2 } },
  });
  expect(await upload).toEqual({ Vid: 'v123abc', Meta: { Duration: 2 } });
  expect(window.__pugyingVideoProgress).toBe(100);
});

it('rejects a malformed completion instead of assuming publication succeeded', async () => {
  const { window, callbacks, uploader } = fixture();
  const upload = window.__pugyingToutiaoVideoUpload({});
  await vi.waitFor(() => expect(uploader.start).toHaveBeenCalledOnce());
  callbacks.complete({ uploadResult: {} });
  await expect(upload).rejects.toMatchObject({ code: 'ARTICLE_API_CHANGED' });
});

it('does not retry failed uploads', async () => {
  const { window, callbacks, uploader } = fixture();
  const upload = window.__pugyingToutiaoVideoUpload({});
  await vi.waitFor(() => expect(uploader.start).toHaveBeenCalledOnce());
  callbacks.error({});
  await expect(upload).rejects.toMatchObject({ code: 'VIDEO_UPLOAD_FAILED' });
  expect(uploader.start).toHaveBeenCalledOnce();
});

it('finds the official uploader in the isolated Garfish app global', () => {
  const { ready, window } = fixture(true);
  expect(ready).toBe(true);
  expect(typeof window.__pugyingToutiaoVideoUpload).toBe('function');
});
