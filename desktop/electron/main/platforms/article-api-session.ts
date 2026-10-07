import { BrowserWindow, session, type Session } from 'electron';
import { randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { basename, isAbsolute } from 'node:path';
import { injectCookies } from '../auth-browser';
import {
  ArticleApiError,
  articleRecord,
  assertArticleActive,
  assertArticleResponse,
  type ArticleApiSession,
  type ArticlePlatform,
  type ArticlePublishOptions,
  type UploadedArticleImage,
} from './article-api';
import {
  BILIBILI_ARTICLE_RUNTIME,
  DOUYIN_ARTICLE_RUNTIME,
  TOUTIAO_ARTICLE_RUNTIME,
  TOUTIAO_GRAPHIC_RUNTIME,
  XIAOHONGSHU_GRAPHIC_RUNTIME,
} from './article-platform-runtime';
import { signBilibiliQuery } from './bilibili-wbi';

export type CookiePublishPlatform = ArticlePlatform | 'xiaohongshu';

/** 图文与文章共用平台 Cookie、图片上传和签名传输，不依赖文章正文。 */
export type CookiePublishSessionOptions = Pick<
  ArticlePublishOptions,
  'payload' | 'onProgress' | 'signal'
>;

const CONFIG = {
  douyin: {
    host: 'creator.douyin.com',
    domain: 'douyin.com',
    url: 'https://creator.douyin.com/creator-micro/content/post/article?enter_from=publish_page&media_type=article&type=new',
    runtime: DOUYIN_ARTICLE_RUNTIME,
    paths: [
      '/web/api/media/aweme/create_v2/',
      '/web/api/media/user/info/',
      '/web/api/media/item/info/',
    ],
  },
  toutiao: {
    host: 'mp.toutiao.com',
    domain: 'toutiao.com',
    url: 'https://mp.toutiao.com/profile_v4/graphic/publish',
    runtime: TOUTIAO_ARTICLE_RUNTIME,
    paths: [
      '/mp/agw/article/wtt',
      '/mp/agw/article/wtt/edit',
      '/mp/agw/article/new',
      '/mp/agw/article/publish',
      '/mp/agw/diversity/publish/strategy/v1/check/',
    ],
  },
  xiaohongshu: {
    host: 'creator.xiaohongshu.com',
    domain: 'xiaohongshu.com',
    url: 'https://creator.xiaohongshu.com/publish/publish?source=official&target=image',
    runtime: XIAOHONGSHU_GRAPHIC_RUNTIME,
    paths: ['/web_api/sns/v2/note', '/web_api/sns/capa/postgw/note/detail'],
  },
  bilibili: {
    host: 'member.bilibili.com',
    domain: 'bilibili.com',
    url: 'https://member.bilibili.com/york/read-editor',
    runtime: BILIBILI_ARTICLE_RUNTIME,
    paths: [
      '/x/web-interface/nav',
      '/x/dynamic/feed/create/opus_init_check',
      '/x/dynamic/feed/create/opus',
    ],
  },
} as const;

function imageMime(bytes: Buffer): string {
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return 'image/png';
  }
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
    return 'image/jpeg';
  }
  if (/^GIF8[79]a$/.test(bytes.subarray(0, 6).toString())) {
    return 'image/gif';
  }
  if (
    bytes.subarray(0, 4).toString() === 'RIFF' &&
    bytes.subarray(8, 12).toString() === 'WEBP'
  ) {
    return 'image/webp';
  }
  throw new ArticleApiError(
    'ARTICLE_IMAGE_UNSUPPORTED',
    '请使用 JPEG、PNG 或平台支持的图片格式',
  );
}

class CookieArticleApiSession implements ArticleApiSession {
  private closed = false;
  private submitting = false;
  private cancelTimer: ReturnType<typeof setInterval>;
  private wbiKeys?: { image: string; sub: string };
  private verificationAttempted = false;

  constructor(
    private readonly platform: CookiePublishPlatform,
    private readonly options: CookiePublishSessionOptions,
    private readonly isolated: Session,
    private readonly window: BrowserWindow,
  ) {
    if (platform === 'douyin') {
      isolated.webRequest.onHeadersReceived(
        {
          urls: ['https://creator.douyin.com/web/api/media/aweme/create_v2/*'],
        },
        (details, callback) => {
          callback({});
          const needsVerification = Object.keys(
            details.responseHeaders || {},
          ).some(
            (name) => name.toLowerCase() === 'x-tt-verify-passport-decision',
          );
          if (needsVerification && this.submitting && !window.isDestroyed()) {
            window.show();
            window.focus();
            options.onProgress({
              requestId: options.payload.requestId,
              targetId: options.payload.targetId,
              platform,
              phase: 'submitting',
              message: '请在平台窗口完成验证',
            });
          }
        },
      );
    }
    this.cancelTimer = setInterval(() => {
      if (
        options.signal.cancelled &&
        !this.submitting &&
        !window.isDestroyed()
      ) {
        window.destroy();
      }
    }, 100);
  }

  async open(): Promise<void> {
    const config = CONFIG[this.platform];
    const cookies = this.options.payload.cookies
      .filter((cookie) => {
        const host = cookie.domain?.replace(/^\./, '').toLowerCase();
        return (
          (!host ||
            host === config.domain ||
            host.endsWith(`.${config.domain}`)) &&
          (!cookie.expirationDate || cookie.expirationDate > Date.now() / 1000)
        );
      })
      .map((cookie) => ({ ...cookie, domain: cookie.domain || config.host }));
    if (!cookies.length) {
      throw new ArticleApiError('AUTH_EXPIRED', '账号登录已失效，请重新授权');
    }
    await injectCookies(this.isolated, cookies);
    assertArticleActive(this.options.signal);
    // 平台辅助 iframe 可能很晚才结束加载；主文档就绪即可开始等待签名 SDK。
    const domReady = new Promise<void>((resolve) =>
      this.window.webContents.once('dom-ready', () => resolve()),
    );
    await this.bounded(
      Promise.race([
        this.window.loadURL(
          this.platform === 'douyin' &&
            this.options.payload.contentType === 'graphic'
            ? 'https://creator.douyin.com/creator-micro/content/post/image'
            : this.platform === 'toutiao' &&
                this.options.payload.contentType === 'graphic'
              ? 'https://mp.toutiao.com/profile_v4/weitoutiao/publish'
              : config.url,
        ),
        domReady,
      ]),
      30000,
    );
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      assertArticleActive(this.options.signal);
      if (this.window.isDestroyed()) {
        throw new ArticleApiError(
          'HTTP_REQUEST_FAILED',
          '暂时无法连接发布平台',
        );
      }
      const url = new URL(this.window.webContents.getURL());
      if (url.hostname !== config.host || /login|passport/.test(url.pathname)) {
        throw new ArticleApiError('AUTH_EXPIRED', '账号登录已失效，请重新授权');
      }
      const ready = await this.bounded(
        this.window.webContents.mainFrame.executeJavaScript(
          this.platform === 'toutiao' &&
            this.options.payload.contentType === 'graphic'
            ? TOUTIAO_GRAPHIC_RUNTIME
            : config.runtime,
        ),
        5000,
      );
      if (ready === 'AUTH_EXPIRED') {
        throw new ArticleApiError('AUTH_EXPIRED', '账号登录已失效，请重新授权');
      }
      if (ready === true) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    throw new ArticleApiError(
      'ARTICLE_API_CHANGED',
      '暂时无法连接发布功能，请稍后重试',
    );
  }

  private async bounded<T>(promise: Promise<T>, timeoutMs = 60000): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            if (!this.window.isDestroyed()) {
              this.window.destroy();
            }
            reject(
              new ArticleApiError(
                this.submitting ? 'PUBLISH_RESULT_UNKNOWN' : 'HTTP_TIMEOUT',
                this.submitting
                  ? '尚未确认发布结果，请先到平台查看'
                  : '连接平台超时，请稍后重试',
              ),
            );
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private async execute<T>(script: string, timeoutMs = 60000): Promise<T> {
    if (this.closed || this.window.isDestroyed()) {
      assertArticleActive(this.options.signal);
      throw new ArticleApiError('HTTP_REQUEST_FAILED', '暂时无法连接发布平台');
    }
    const wrapped = `(async () => {
      if (location.hostname !== ${JSON.stringify(CONFIG[this.platform].host)}) {
        return { ok: false, code: 'AUTH_EXPIRED' };
      }
      try { return { ok: true, data: await (${script}) }; }
      catch (error) {
        const response = error?.response || error?.err?.response;
        const code = response?.data?.status_code || error?.status_code || response?.status || error?.code;
        return { ok: false, code: String(code || '') };
      }
    })()`;
    let response: { ok: boolean; data: T; code?: string };
    try {
      response = (await this.bounded(
        this.window.webContents.mainFrame.executeJavaScript(wrapped),
        timeoutMs,
      )) as typeof response;
    } catch (error) {
      assertArticleActive({
        cancelled: this.options.signal.cancelled && !this.submitting,
      });
      if (error instanceof ArticleApiError) {
        throw error;
      }
      throw new ArticleApiError(
        this.submitting ? 'PUBLISH_RESULT_UNKNOWN' : 'HTTP_REQUEST_FAILED',
        this.submitting
          ? '尚未确认发布结果，请先到平台查看'
          : '暂时无法连接发布平台，请稍后重试',
      );
    }
    if (!response?.ok) {
      assertArticleActive({
        cancelled: this.options.signal.cancelled && !this.submitting,
      });
      if (response?.code === 'ARTICLE_API_CHANGED') {
        throw new ArticleApiError(
          'ARTICLE_API_CHANGED',
          '暂时无法连接发布功能，请稍后重试',
        );
      }
      if (
        [
          'AUTH_EXPIRED',
          '-101',
          '401',
          '1003',
          '2001',
          '-100',
          '-10001',
        ].includes(response?.code || '')
      ) {
        throw new ArticleApiError('AUTH_EXPIRED', '账号登录已失效，请重新授权');
      }
      if (['2222', '-352'].includes(response?.code || '')) {
        throw new ArticleApiError(
          'PLATFORM_VERIFICATION_REQUIRED',
          '平台需要验证，请到创作者中心完成后再发布',
        );
      }
      if (response?.code === '403') {
        throw new ArticleApiError(
          'PLATFORM_REJECTED',
          '平台未接受本次发布，请到创作者中心查看账号要求',
        );
      }
      throw new ArticleApiError(
        this.submitting ? 'PUBLISH_RESULT_UNKNOWN' : 'HTTP_REQUEST_FAILED',
        this.submitting
          ? '尚未确认发布结果，请先到平台查看'
          : '暂时无法连接发布平台，请稍后重试',
      );
    }
    return response.data;
  }

  private async bilibiliQuery(
    params: Record<string, unknown>,
  ): Promise<string> {
    if (!this.wbiKeys) {
      const nav = await this.execute<Record<string, unknown>>(
        `window.__pugyingArticleApi.request('/x/web-interface/nav')`,
      );
      assertArticleResponse(nav, 'bilibili');
      const data = articleRecord(nav.data);
      if (data.isLogin !== true) {
        throw new ArticleApiError('AUTH_EXPIRED', '账号登录已失效，请重新授权');
      }
      const images = articleRecord(data.wbi_img);
      const key = (url: unknown) =>
        typeof url === 'string'
          ? new URL(url).pathname.split('/').pop()?.split('.')[0] || ''
          : '';
      this.wbiKeys = { image: key(images.img_url), sub: key(images.sub_url) };
      if (!this.wbiKeys.image || !this.wbiKeys.sub) {
        throw new ArticleApiError(
          'ARTICLE_API_CHANGED',
          '暂时无法连接文章发布功能，请稍后重试',
        );
      }
    }
    const webParams = await this.execute<Record<string, unknown>>(
      'window.__pugyingArticleApi.wbiParams()',
    );
    return signBilibiliQuery(
      { ...params, ...webParams },
      this.wbiKeys.image,
      this.wbiKeys.sub,
    );
  }

  async request(
    path: string,
    data?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    assertArticleActive(this.options.signal);
    const url = new URL(path, `https://${CONFIG[this.platform].host}`);
    if (
      url.origin !== `https://${CONFIG[this.platform].host}` ||
      !(CONFIG[this.platform].paths as readonly string[]).includes(
        url.pathname,
      ) ||
      (url.pathname === '/web_api/sns/capa/postgw/note/detail' &&
        (data !== undefined ||
          url.searchParams.size !== 2 ||
          !/^[a-f0-9]{24}$/.test(url.searchParams.get('note_id') ?? '') ||
          url.searchParams.get('source') !== 'web')) ||
      (url.pathname === '/mp/agw/article/wtt/edit' &&
        (data !== undefined ||
          url.searchParams.size !== 1 ||
          !/^\d+$/.test(url.searchParams.get('id') ?? ''))) ||
      (url.pathname === '/web/api/media/item/info/' &&
        (data !== undefined ||
          url.searchParams.size !== 1 ||
          !/^\d+$/.test(url.searchParams.get('item_id') ?? '')))
    ) {
      throw new ArticleApiError('invalid_payload', '发布请求不可用');
    }
    const submit = data !== undefined;
    if (this.platform === 'bilibili') {
      const params: Record<string, unknown> = Object.fromEntries(
        url.searchParams,
      );
      if (submit) {
        Object.assign(
          params,
          await this.execute<Record<string, unknown>>(
            'window.__pugyingArticleApi.riskParams()',
          ),
        );
        const cookies = await this.isolated.cookies.get({
          url: 'https://api.bilibili.com',
        });
        const csrf =
          cookies.find((cookie) => cookie.name === 'bili_jct')?.value || '';
        if (!csrf) {
          throw new ArticleApiError(
            'AUTH_EXPIRED',
            '账号登录已失效，请重新授权',
          );
        }
        params.csrf = csrf;
        params.gaia_source = 'main_web';
        params['w_opus_req.upload_id'] = articleRecord(data.opus_req).upload_id;
      }
      // 原生客户端会先把 URL 参数合并到 params，再进行 WBI 签名。
      path = `${url.pathname}?${await this.bilibiliQuery(params)}`;
    }
    assertArticleActive(this.options.signal);
    this.submitting = submit;
    try {
      const result = await this.execute<Record<string, unknown>>(
        `window.__pugyingArticleApi.request(${JSON.stringify(path)}, ${JSON.stringify(data) ?? 'undefined'})`,
        this.platform === 'douyin' && submit ? 600000 : 60000,
      );
      if (
        this.platform === 'bilibili' &&
        submit &&
        result.code === -352 &&
        !this.verificationAttempted &&
        (await this.execute<boolean>(
          'window.__pugyingArticleApi.hasVerification()',
        ))
      ) {
        // 平台已明确拒绝本次提交；由用户完成官方验证后，仅重提一次。
        this.verificationAttempted = true;
        this.submitting = false;
        this.window.show();
        this.window.focus();
        this.options.onProgress({
          requestId: this.options.payload.requestId,
          targetId: this.options.payload.targetId,
          platform: this.platform,
          phase: 'submitting',
          message: '请在平台窗口完成验证',
        });
        try {
          await this.execute('window.__pugyingArticleApi.verify()', 600000);
        } catch {
          assertArticleActive(this.options.signal);
          throw new ArticleApiError(
            'PLATFORM_VERIFICATION_REQUIRED',
            '平台验证尚未完成，请完成后再发布',
          );
        } finally {
          if (!this.window.isDestroyed()) {
            this.window.hide();
          }
        }
        assertArticleActive(this.options.signal);
        // 清除上一轮签名参数，重新生成签名和环境参数。
        return this.request(url.pathname, data);
      }
      return result;
    } catch (error) {
      // 已发出的提交可能成功；未知结果不能当作取消或可自动重试的失败。
      if (submit && !(error instanceof ArticleApiError)) {
        throw new ArticleApiError(
          'PUBLISH_RESULT_UNKNOWN',
          '尚未确认发布结果，请先到平台查看',
        );
      }
      if (!submit) {
        assertArticleActive(this.options.signal);
      }
      throw error;
    }
  }

  async uploadImage(path: string): Promise<UploadedArticleImage> {
    assertArticleActive(this.options.signal);
    if (!isAbsolute(path)) {
      throw new ArticleApiError('MEDIA_MISSING', '找不到图片，请重新选择');
    }
    const info = await stat(path).catch(() => null);
    if (!info?.isFile()) {
      throw new ArticleApiError('MEDIA_MISSING', '找不到图片，请重新选择');
    }
    if (info.size > 20 * 1024 * 1024) {
      throw new ArticleApiError(
        'ARTICLE_IMAGE_UNSUPPORTED',
        '图片不能超过 20MB',
      );
    }
    const bytes = await readFile(path);
    const mime = imageMime(bytes);
    if (
      (['douyin', 'xiaohongshu'].includes(this.platform) &&
        mime === 'image/gif') ||
      (this.platform === 'toutiao' &&
        !['image/jpeg', 'image/png'].includes(mime))
    ) {
      throw new ArticleApiError(
        'ARTICLE_IMAGE_UNSUPPORTED',
        '该平台需要 JPEG 或 PNG 图片，请重新选择',
      );
    }
    const query =
      this.platform === 'bilibili' ? await this.bilibiliQuery({}) : '';
    let csrf = '';
    if (this.platform === 'bilibili') {
      const cookies = await this.isolated.cookies.get({
        url: 'https://api.bilibili.com',
      });
      csrf = cookies.find((cookie) => cookie.name === 'bili_jct')?.value || '';
      if (!csrf) {
        throw new ArticleApiError('AUTH_EXPIRED', '账号登录已失效，请重新授权');
      }
    }
    assertArticleActive(this.options.signal);
    const result = await this.execute<UploadedArticleImage>(`(async () => {
      const binary = atob(${JSON.stringify(bytes.toString('base64'))});
      const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
      const file = new File([bytes], ${JSON.stringify(basename(path))}, { type: ${JSON.stringify(mime)} });
      return window.__pugyingArticleApi.upload(file, ${JSON.stringify(query)}, ${JSON.stringify(csrf)});
    })()`);
    const url =
      typeof result?.url === 'string'
        ? result.url.replace(/^http:/, 'https:').replace(/^\/\//, 'https://')
        : '';
    if (
      !/^https:\/\//.test(url) ||
      !result.uri ||
      !(result.width > 0) ||
      !(result.height > 0)
    ) {
      throw new ArticleApiError(
        'ARTICLE_API_CHANGED',
        '未能确认图片上传结果，请稍后重试',
      );
    }
    return { ...result, url };
  }

  async dispose(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    clearInterval(this.cancelTimer);
    if (this.platform === 'douyin') {
      this.isolated.webRequest.onHeadersReceived(null);
    }
    if (!this.window.isDestroyed()) {
      this.window.destroy();
    }
    await Promise.allSettled([
      this.isolated.clearStorageData(),
      this.isolated.clearCache(),
      this.isolated.closeAllConnections(),
    ]);
  }
}

export async function createArticleApiSession(
  platform: CookiePublishPlatform,
  options: CookiePublishSessionOptions,
): Promise<ArticleApiSession> {
  assertArticleActive(options.signal);
  const isolated = session.fromPartition(
    `${options.payload.contentType === 'graphic' ? 'graphic' : 'article'}-api-${platform}-${randomUUID()}`,
  );
  isolated.setPermissionRequestHandler((_webContents, _permission, callback) =>
    callback(false),
  );
  const window = new BrowserWindow({
    show: false,
    width: 1280,
    height: 860,
    webPreferences: {
      session: isolated,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const api = new CookieArticleApiSession(platform, options, isolated, window);
  try {
    await api.open();
    return api;
  } catch (error) {
    await api.dispose();
    assertArticleActive(options.signal);
    throw error;
  }
}
