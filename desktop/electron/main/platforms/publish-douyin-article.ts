import type {
  PlatformPublishProgressPayload,
  PlatformPublishResultPayload,
  PlatformPublishStartPayload,
} from '../publish-protocol';

type ProgressFn = (progress: PlatformPublishProgressPayload) => void;

/**
 * 抖音「发文章」适配器骨架：与图文（多图 Tab）分离。
 * 首版未完成自动化，明确返回未实现，避免误走图文链路。
 */
export async function runDouyinArticlePublish(options: {
  payload: PlatformPublishStartPayload;
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
