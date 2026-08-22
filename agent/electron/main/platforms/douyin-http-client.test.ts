import { describe, expect, it, vi } from 'vitest';
import {
  buildCookieHeader,
  DouyinHttpClient,
  DouyinHttpError,
  type DouyinHttpTransport,
} from './douyin-http-client';

describe('DouyinHttpClient', () => {
  it('组装 Cookie 头并交给网络传输层', async () => {
    const request = vi.fn().mockResolvedValue({
      status: 200,
      headers: {},
      body: new Uint8Array(),
    });
    const transport: DouyinHttpTransport = { request };
    const client = new DouyinHttpClient(
      [
        { name: 'sessionid', value: 'abc' },
        { name: 'csrf', value: 'token=value' },
      ],
      transport,
      1234,
    );

    await client.request({ url: 'https://example.invalid/action', method: 'POST' });

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { Cookie: 'sessionid=abc; csrf=token=value' },
        timeoutMs: 1234,
      }),
    );
  });

  it('过滤可能污染请求头的 Cookie', () => {
    expect(
      buildCookieHeader([
        { name: 'good', value: 'ok' },
        { name: 'bad name', value: 'ignored' },
        { name: 'bad-value', value: 'x;\r\nInjected: yes' },
      ]),
    ).toBe('good=ok');
  });

  it('把 401/403 映射为 AUTH_EXPIRED', async () => {
    const transport: DouyinHttpTransport = {
      request: vi.fn().mockResolvedValue({
        status: 403,
        headers: {},
        body: new Uint8Array(),
      }),
    };
    const client = new DouyinHttpClient(
      [{ name: 'sessionid', value: 'expired' }],
      transport,
    );

    await expect(
      client.request({ url: 'https://example.invalid/action' }),
    ).rejects.toMatchObject<DouyinHttpError>({ code: 'AUTH_EXPIRED', status: 403 });
  });
});
