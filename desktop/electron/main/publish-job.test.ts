import {
  cancelPublishJob,
  isPublishBusy,
  startPublishJob,
} from './publish-job';
import type { PlatformPublishStartPayload } from './publish-protocol';

function basePayload(
  overrides: Partial<PlatformPublishStartPayload> = {},
): PlatformPublishStartPayload {
  return {
    requestId: 'pub-1',
    targetId: 'target-1',
    platform: 'douyin',
    accountId: 'account-1',
    mediaPath: '/tmp/pugying-test/video.mp4',
    coverPath: '/tmp/pugying-test/cover.jpg',
    coverLandscapePath: '/tmp/pugying-test/cover-landscape.jpg',
    title: '测试标题',
    cookies: [{ name: 'sessionid', value: 'abc' }],
    ...overrides,
  };
}

beforeAll(() => {
  process.env.PUGYING_PUBLISH_STUB = '1';
});

afterEach(() => {
  if (isPublishBusy()) {
    cancelPublishJob('pub-1');
    cancelPublishJob('pub-2');
  }
});

describe('publish-job stub', () => {
  it('rejects invalid payload', () => {
    const started = startPublishJob({
      payload: basePayload({ title: '' }),
      onProgress: () => undefined,
      onResult: () => undefined,
    });
    expect(started).toEqual({ error: 'invalid_payload' });
  });

  it('accepts graphic payload without landscape cover', async () => {
    const result = await new Promise<{ ok: boolean }>((resolve) => {
      const started = startPublishJob({
        payload: basePayload({
          contentType: 'graphic',
          mediaPath: undefined,
          mediaPaths: ['/tmp/pugying-test/a.jpg', '/tmp/pugying-test/b.jpg'],
          coverLandscapePath: undefined,
        }),
        onProgress: () => undefined,
        onResult: (r) => {
          resolve(r);
        },
      });
      expect(started).toEqual({ ok: true });
    });
    expect(result.ok).toBe(true);
  });

  it('rejects graphic payload without images', () => {
    const started = startPublishJob({
      payload: basePayload({
        contentType: 'graphic',
        mediaPath: undefined,
        mediaPaths: [],
        coverLandscapePath: undefined,
      }),
      onProgress: () => undefined,
      onResult: () => undefined,
    });
    expect(started).toEqual({ error: 'invalid_payload' });
  });

  it('accepts article payload without images', async () => {
    const result = await new Promise<{ ok: boolean }>((resolve) => {
      const started = startPublishJob({
        payload: basePayload({
          contentType: 'article',
          mediaPath: undefined,
          mediaPaths: [],
          coverLandscapePath: '/tmp/pugying-test/cover-landscape.jpg',
        }),
        onProgress: () => undefined,
        onResult: (r) => {
          resolve(r);
        },
      });
      expect(started).toEqual({ ok: true });
    });
    expect(result.ok).toBe(true);
  });

  it('rejects unsupported platforms', () => {
    const started = startPublishJob({
      payload: basePayload({ platform: 'bilibili' }),
      onProgress: () => undefined,
      onResult: () => undefined,
    });
    expect(started).toEqual({ error: 'unsupported_platform' });
  });

  it('runs one job at a time and emits success', async () => {
    const progress: string[] = [];
    const result = await new Promise<{ ok: boolean; platformPostId?: string }>(
      (resolve) => {
        const started = startPublishJob({
          payload: basePayload(),
          onProgress: (p) => {
            progress.push(p.phase);
          },
          onResult: (r) => {
            resolve(r);
          },
        });
        expect(started).toEqual({ ok: true });
        expect(isPublishBusy()).toBe(true);

        const second = startPublishJob({
          payload: basePayload({ requestId: 'pub-2' }),
          onProgress: () => undefined,
          onResult: () => undefined,
        });
        expect(second).toEqual({ error: 'busy' });
      },
    );

    expect(result.ok).toBe(true);
    expect(result.platformPostId).toMatch(/^stub-/);
    expect(progress).toContain('accepted');
    expect(progress).toContain('done');
    expect(isPublishBusy()).toBe(false);
  });

  it('cancels an in-flight job', async () => {
    const result = await new Promise<{ ok: boolean; error?: string }>(
      (resolve) => {
        startPublishJob({
          payload: basePayload(),
          onProgress: () => undefined,
          onResult: (r) => {
            resolve(r);
          },
        });
        expect(cancelPublishJob('pub-1')).toBe(true);
      },
    );
    expect(result).toMatchObject({ ok: false, error: 'cancelled' });
    expect(isPublishBusy()).toBe(false);
  });
});
