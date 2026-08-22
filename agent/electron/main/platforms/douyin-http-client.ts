import { net } from 'electron';
import type { AgentCookie } from '../protocol';

export type DouyinHttpErrorCode =
  | 'AUTH_EXPIRED'
  | 'HTTP_TIMEOUT'
  | 'HTTP_REQUEST_FAILED';

export class DouyinHttpError extends Error {
  constructor(
    readonly code: DouyinHttpErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'DouyinHttpError';
  }
}

export interface DouyinHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array;
}

export interface DouyinHttpTransport {
  request(options: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: Uint8Array;
    timeoutMs: number;
  }): Promise<DouyinHttpResponse>;
}

const electronNetTransport: DouyinHttpTransport = {
  async request(options) {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, options.timeoutMs);

    try {
      const response = await net.fetch(options.url, {
        method: options.method,
        headers: options.headers,
        body: options.body,
        signal: controller.signal,
      });
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });
      return {
        status: response.status,
        headers,
        body: new Uint8Array(await response.arrayBuffer()),
      };
    } finally {
      clearTimeout(timer);
    }
  },
};

/**
 * 仅把当前发布任务携带的已授权 Cookie 转为请求头，不持久化，也不交给后端。
 * 跳过含控制字符的异常项，避免 Cookie 数据污染 HTTP 头。
 */
export function buildCookieHeader(cookies: AgentCookie[]): string {
  return cookies
    .filter(
      (cookie) =>
        /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(cookie.name) &&
        cookie.value.length > 0 &&
        !/[\u0000-\u001f\u007f;]/.test(cookie.value),
    )
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
}

/**
 * 创作者中心后台接口并非开放平台官方契约，调用方必须通过可注入映射提供 URL/载荷；
 * 此客户端只负责 Cookie 会话、超时和通用错误分类，不内置未验证 endpoint 或签名。
 */
export class DouyinHttpClient {
  private readonly cookieHeader: string;

  constructor(
    cookies: AgentCookie[],
    private readonly transport: DouyinHttpTransport = electronNetTransport,
    private readonly timeoutMs = 30_000,
  ) {
    this.cookieHeader = buildCookieHeader(cookies);
  }

  async request(options: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: Uint8Array;
  }): Promise<DouyinHttpResponse> {
    if (!this.cookieHeader) {
      throw new DouyinHttpError(
        'AUTH_EXPIRED',
        '未找到可用的抖音登录 Cookie，请重新授权媒体账号',
      );
    }

    let response: DouyinHttpResponse;
    try {
      response = await this.transport.request({
        url: options.url,
        method: options.method ?? 'GET',
        headers: {
          ...options.headers,
          Cookie: this.cookieHeader,
        },
        body: options.body,
        timeoutMs: this.timeoutMs,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === 'AbortError' || /aborted|timeout/i.test(error.message))
      ) {
        throw new DouyinHttpError('HTTP_TIMEOUT', '抖音后台 HTTP 请求超时');
      }
      throw new DouyinHttpError(
        'HTTP_REQUEST_FAILED',
        error instanceof Error ? error.message : String(error),
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new DouyinHttpError(
        'AUTH_EXPIRED',
        '抖音登录已失效，请重新授权媒体账号',
        response.status,
      );
    }
    if (response.status < 200 || response.status >= 300) {
      throw new DouyinHttpError(
        'HTTP_REQUEST_FAILED',
        `抖音后台 HTTP 请求失败（${response.status}）`,
        response.status,
      );
    }
    return response;
  }
}
