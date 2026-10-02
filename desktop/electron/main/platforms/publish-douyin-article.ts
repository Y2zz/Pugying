import type { ArticlePublishDocument } from '../article-publish-format';
import type {
  PlatformPublishProgressPayload,
  PlatformPublishResultPayload,
  PlatformPublishStartPayload,
} from '../publish-protocol';

type ProgressFn = (progress: PlatformPublishProgressPayload) => void;

/**
 * 抖音「发文章」适配器骨架：与图文（多图 Tab）分离。
 * 仅接收已解析正文。实现时先上传 article.imagePaths，再按已验证平台格式转换。
 * 首版未完成自动化，明确返回未实现，避免误走图文链路。
 */
export async function runDouyinArticlePublish(options: {
  payload: Omit<PlatformPublishStartPayload, 'body'>;
  article: ArticlePublishDocument;
  onProgress: ProgressFn;
  signal: { cancelled: boolean };
}): Promise<PlatformPublishResultPayload> {
  const { payload, onProgress, signal } = options;
  const base = {
    requestId: payload.requestId,
    targetId: payload.targetId,
    platform: payload.platform,
  };

  if (signal.cancelled) {
    return { ...base, ok: false, error: 'cancelled', errorCode: 'cancelled' };
  }

  onProgress({
    ...base,
    phase: 'accepted',
    message: '文章发布即将支持',
  });

  return {
    ...base,
    ok: false,
    error: 'not_implemented',
    errorCode: 'not_implemented',
  };
}
