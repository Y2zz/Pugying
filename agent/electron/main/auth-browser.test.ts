import { session } from 'electron';
import {
  cancelAuthJob,
  disposeAuthJob,
  getActiveAuthJobCount,
  getActiveBrowseWindowCount,
  startAuthBrowser,
  startCreatorBrowser,
} from './auth-browser';
import type { PlatformAuthResultPayload } from './protocol';

/** Partition names recorded by the electron mock's session.fromPartition. */
function recordedPartitions(): string[] {
  return (session as unknown as { _partitions: string[] })._partitions;
}

async function waitFor(
  condition: () => boolean,
  timeoutMs = 2000,
): Promise<void> {
  const startedAt = Date.now();
  while (!condition()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('timed out waiting for condition');
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }
}

describe('startAuthBrowser', () => {
  it('rejects unsupported platforms before creating anything', () => {
    const before = getActiveAuthJobCount();
    const result = startAuthBrowser({
      requestId: 'ab-unsupported',
      platform: 'myspace',
      onResult: () => undefined,
    });
    expect(result).toEqual({ error: 'unsupported_platform:myspace' });
    expect(getActiveAuthJobCount()).toBe(before);
  });

  it('creates an isolated temp partition, rejects duplicates and cancels cleanly', async () => {
    const results: PlatformAuthResultPayload[] = [];
    try {
      const handle = startAuthBrowser({
        requestId: 'ab-r1',
        platform: 'douyin',
        onResult: (result) => {
          results.push(result);
        },
      });
      expect('error' in handle).toBe(false);
      expect(recordedPartitions()).toContain('temp:auth-ab-r1');
      expect(getActiveAuthJobCount()).toBe(1);

      const duplicate = startAuthBrowser({
        requestId: 'ab-r1',
        platform: 'douyin',
        onResult: () => undefined,
      });
      expect(duplicate).toEqual({ error: 'duplicate_request_id' });

      const cancelled = await cancelAuthJob('ab-r1', (result) => {
        results.push(result);
      });
      expect(cancelled).toBe(true);
      expect(results).toEqual([
        {
          requestId: 'ab-r1',
          ok: false,
          error: 'cancelled',
          platform: 'douyin',
        },
      ]);
      expect(getActiveAuthJobCount()).toBe(0);
    } finally {
      await disposeAuthJob('ab-r1');
    }
  });

  it('reports window_closed when the auth window goes away', async () => {
    const results: PlatformAuthResultPayload[] = [];
    try {
      const handle = startAuthBrowser({
        requestId: 'ab-r2',
        platform: 'bilibili',
        onResult: (result) => {
          results.push(result);
        },
      });
      if ('error' in handle) {
        throw new Error(`unexpected start failure: ${handle.error}`);
      }

      handle.window.destroy();
      await waitFor(() => results.length > 0 && getActiveAuthJobCount() === 0);
      expect(results[0]).toEqual({
        requestId: 'ab-r2',
        ok: false,
        error: 'window_closed',
        platform: 'bilibili',
      });
    } finally {
      await disposeAuthJob('ab-r2');
    }
  });
});

describe('cancelAuthJob', () => {
  it('returns false for unknown request ids', async () => {
    const cancelled = await cancelAuthJob('no-such-job', () => undefined);
    expect(cancelled).toBe(false);
  });
});

describe('startCreatorBrowser', () => {
  it('rejects unsupported platforms', async () => {
    const result = await startCreatorBrowser({
      requestId: 'open-1',
      accountId: 'acc-1',
      platform: 'myspace',
      cookies: [{ name: 'a', value: 'b' }],
      onClosed: () => undefined,
    });
    expect(result).toEqual({ error: 'unsupported_platform:myspace' });
    expect(getActiveBrowseWindowCount()).toBe(0);
  });

  it('rejects requests without cookies', async () => {
    const result = await startCreatorBrowser({
      requestId: 'open-2',
      accountId: 'acc-2',
      platform: 'douyin',
      cookies: [],
      onClosed: () => undefined,
    });
    expect(result).toEqual({ error: 'missing_cookies' });
    expect(getActiveBrowseWindowCount()).toBe(0);
  });
});
