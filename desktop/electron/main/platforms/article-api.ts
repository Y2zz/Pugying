import type { ArticlePublishDocument } from '../article-publish-format';
import type {
  PlatformPublishProgressPayload,
  PlatformPublishResultPayload,
  PlatformPublishStartPayload,
} from '../publish-protocol';

export type ArticlePlatform = 'douyin' | 'toutiao' | 'bilibili';
export interface UploadedArticleImage {
  url: string;
  uri: string;
  width: number;
  height: number;
  size: number;
}
export interface ArticleApiSession {
  request(
    path: string,
    data?: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
  uploadImage(path: string): Promise<UploadedArticleImage>;
  dispose(): Promise<void>;
}
export interface ArticlePublishOptions {
  payload: Omit<PlatformPublishStartPayload, 'body'>;
  article: ArticlePublishDocument;
  onProgress: (progress: PlatformPublishProgressPayload) => void;
  signal: { cancelled: boolean };
  /** 可注入传输层以核对接口契约，生产默认使用隔离 Cookie 会话。 */
  createSession?: (
    platform: ArticlePlatform,
    options: ArticlePublishOptions,
  ) => Promise<ArticleApiSession>;
}
export class ArticleApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly receipt?: unknown,
  ) {
    super(message);
  }
}
export function assertArticleActive(signal: { cancelled: boolean }): void {
  if (signal.cancelled) {
    throw new ArticleApiError('cancelled', '发布已取消');
  }
}
export function articleRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
/** 平台大整数 ID 必须保持字符串；不接受已被 JSON.parse 舍入的数字。 */
export function articlePostId(value: unknown): string {
  if (typeof value === 'string' && /^\d+$/.test(value) && !/^0+$/.test(value)) {
    return value;
  }
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }
  throw new ArticleApiError(
    'PUBLISH_RESULT_UNKNOWN',
    '尚未确认发布结果，请先到平台查看',
  );
}
export function assertArticleResponse(
  response: Record<string, unknown>,
  platform: ArticlePlatform,
  submitted = false,
): void {
  const code = platform === 'douyin' ? response.status_code : response.code;
  if (
    code === 0 ||
    (platform === 'toutiao' &&
      code === undefined &&
      response.message === 'success')
  ) {
    return;
  }
  if (
    (platform === 'douyin' && code === 8) ||
    [-101, 401, 1003, 2001].includes(Number(code))
  ) {
    throw new ArticleApiError('AUTH_EXPIRED', '账号登录已失效，请重新授权');
  }
  if (
    [-352, 2222].includes(Number(code)) ||
    response.verify_ticket ||
    response.verify_code
  ) {
    throw new ArticleApiError(
      'PLATFORM_VERIFICATION_REQUIRED',
      '平台需要验证，请到创作者中心完成后再发布',
    );
  }
  if (code === undefined || code === null) {
    throw new ArticleApiError(
      submitted ? 'PUBLISH_RESULT_UNKNOWN' : 'ARTICLE_API_CHANGED',
      submitted
        ? '尚未确认发布结果，请先到平台查看'
        : '暂时无法确认平台响应，请稍后重试',
    );
  }
  // 不把平台原始响应（可能包含凭证、请求信息）直接显示给用户。
  throw new ArticleApiError(
    'PLATFORM_REJECTED',
    '平台未接受本次发布，请到创作者中心查看账号或内容要求',
  );
}

export async function runArticleApiPublish(
  platform: ArticlePlatform,
  options: ArticlePublishOptions,
  publish: (
    api: ArticleApiSession,
    emit: (
      phase: PlatformPublishProgressPayload['phase'],
      message: string,
    ) => void,
  ) => Promise<{ platformPostId: string; platformUrl: string }>,
): Promise<PlatformPublishResultPayload> {
  const { payload, signal, onProgress } = options;
  const base = {
    requestId: payload.requestId,
    targetId: payload.targetId,
    platform,
  };
  const emit = (
    phase: PlatformPublishProgressPayload['phase'],
    message: string,
  ) => {
    assertArticleActive(signal);
    onProgress({ ...base, phase, message });
  };
  let api: ArticleApiSession | undefined;
  try {
    emit('accepted', '准备发布文章');
    if (!options.article.nodes.length) {
      throw new ArticleApiError('invalid_payload', '请填写文章正文');
    }
    emit('opening_creator', '连接发布平台');
    const factory =
      options.createSession ??
      (await import('./article-api-session')).createArticleApiSession;
    api = await factory(platform, options);
    assertArticleActive(signal);
    const result = await publish(api, emit);
    // 提交得到确定回执后，即使取消同时到达，也必须保留已提交结果。
    try {
      onProgress({ ...base, phase: 'done', message: '文章已提交' });
    } catch {
      // 接收进度的窗口关闭也不能丢失平台已确认的回执。
    }
    return { ...base, ok: true, ...result };
  } catch (error) {
    const known = error instanceof ArticleApiError;
    return {
      ...base,
      ok: false,
      errorCode: known ? error.code : 'PUBLISH_FAILED',
      error: known ? error.message : '文章发布未成功，请稍后重试',
    };
  } finally {
    await api?.dispose().catch(() => {});
  }
}
