import { DEFAULT_DISTRIBUTION_CONCURRENCY } from '../../shared/distribution';
import { prepareArticleDocument } from './article-publish-format';
import type {
  PlatformPublishContentType,
  PlatformPublishProgressPayload,
  PlatformPublishResultPayload,
  PlatformPublishStartPayload,
} from './publish-protocol';

type ProgressFn = (progress: PlatformPublishProgressPayload) => void;
type ResultFn = (result: PlatformPublishResultPayload) => void;

interface ActivePublish {
  requestId: string;
  targetId: string;
  platform: string;
  accountId: string;
  cancelled: boolean;
  settled: boolean;
  stub: boolean;
  signal: { cancelled: boolean };
  onResult: ResultFn;
}

const active = new Map<string, ActivePublish>();
let concurrency = DEFAULT_DISTRIBUTION_CONCURRENCY;

export function setPublishConcurrency(value: number): void {
  concurrency = value;
}

export function isPublishBusy(): boolean {
  return active.size > 0;
}

function resolveContentType(
  payload: PlatformPublishStartPayload,
): PlatformPublishContentType {
  if (payload.contentType === 'graphic') {
    return 'graphic';
  }
  if (payload.contentType === 'article') {
    return 'article';
  }
  return 'video';
}

/** 校验短视频 / 图文 / 文章载荷；图文不要求横封面；文章可不要求 mediaPaths */
function isValidPublishPayload(payload: PlatformPublishStartPayload): boolean {
  const baseOk =
    Boolean(payload.requestId?.trim()) &&
    Boolean(payload.targetId?.trim()) &&
    Boolean(payload.platform?.trim()) &&
    Boolean(payload.accountId?.trim()) &&
    Boolean(payload.title?.trim()) &&
    Array.isArray(payload.cookies) &&
    payload.cookies.length > 0;

  if (!baseOk) {
    return false;
  }

  const contentType = resolveContentType(payload);
  if (contentType === 'graphic' && !payload.coverPath?.trim()) {
    return false;
  }
  if (contentType === 'graphic') {
    const paths = (payload.mediaPaths ?? [])
      .map((p) => p.trim())
      .filter(Boolean);
    const fallback = payload.mediaPath?.trim();
    return paths.length > 0 || Boolean(fallback);
  }

  if (contentType === 'article') {
    return (
      Boolean(payload.body?.trim()) &&
      (payload.platform !== 'douyin' || Boolean(payload.coverPath?.trim()))
    );
  }

  return Boolean(payload.mediaPath?.trim());
}

/**
 * Validates payload, enforces app concurrency and account isolation, then runs the adapter.
 * PUGYING_PUBLISH_STUB 仅用于短视频/图文测试；文章始终调用真实适配器。
 */
export function startPublishJob(options: {
  payload: PlatformPublishStartPayload;
  onProgress: ProgressFn;
  onResult: ResultFn;
}): { ok: true } | { error: string } {
  const { payload } = options;
  if (
    active.size >= concurrency ||
    active.has(payload.requestId) ||
    Array.from(active.values()).some(
      (job) => job.accountId === payload.accountId,
    )
  ) {
    return { error: 'busy' };
  }
  if (!isValidPublishPayload(payload)) {
    return { error: 'invalid_payload' };
  }

  const contentType = resolveContentType(payload);
  if (
    payload.platform !== 'douyin' &&
    (contentType !== 'article' ||
      !['toutiao', 'bilibili'].includes(payload.platform))
  ) {
    return { error: 'unsupported_platform' };
  }

  const useStub =
    process.env.PUGYING_PUBLISH_STUB === '1' && contentType !== 'article';
  const signal = { cancelled: false };
  const job: ActivePublish = {
    requestId: payload.requestId,
    targetId: payload.targetId,
    platform: payload.platform,
    accountId: payload.accountId,
    cancelled: false,
    settled: false,
    stub: useStub,
    signal,
    onResult: options.onResult,
  };
  active.set(job.requestId, job);

  const finish = (result: PlatformPublishResultPayload) => {
    if (job.settled) {
      return;
    }
    job.settled = true;
    active.delete(job.requestId);
    options.onResult(result);
  };

  if (useStub) {
    runStubPublish({
      payload,
      job,
      onProgress: options.onProgress,
      finish,
    });
    return { ok: true };
  }

  const { body: articleHtml, ...articlePayload } = payload;
  const runAdapter =
    contentType === 'graphic'
      ? () =>
          import('./platforms/publish-douyin-graphic').then(
            ({ runDouyinGraphicPublish }) =>
              runDouyinGraphicPublish({
                payload,
                onProgress: options.onProgress,
                signal,
              }),
          )
      : contentType === 'article'
        ? () =>
            import('./platforms/publish-article').then(
              ({ runPlatformArticlePublish }) =>
                runPlatformArticlePublish({
                  payload: articlePayload,
                  article: prepareArticleDocument(
                    articleHtml || '',
                    payload.mediaPaths || [],
                  ),
                  onProgress: options.onProgress,
                  signal,
                }),
            )
        : () =>
            import('./platforms/publish-douyin-strategy').then(
              ({ runDouyinPublishByMode }) =>
                runDouyinPublishByMode({
                  payload,
                  onProgress: options.onProgress,
                  signal,
                }),
            );

  void runAdapter()
    .then((result) => {
      if (
        (job.cancelled || signal.cancelled) &&
        !(
          contentType === 'article' &&
          (result.ok || result.errorCode === 'PUBLISH_RESULT_UNKNOWN')
        )
      ) {
        finish({
          requestId: payload.requestId,
          targetId: payload.targetId,
          ok: false,
          error: 'cancelled',
          errorCode: 'cancelled',
          platform: payload.platform,
        });
        return;
      }
      finish(result);
    })
    .catch((err: unknown) => {
      finish({
        requestId: payload.requestId,
        targetId: payload.targetId,
        ok: false,
        error:
          contentType === 'article'
            ? '文章发布未成功，请检查正文和图片后重试'
            : err instanceof Error
              ? err.message
              : String(err),
        errorCode: job.cancelled ? 'cancelled' : 'PUBLISH_FAILED',
        platform: payload.platform,
      });
    });

  return { ok: true };
}

export function cancelPublishJob(requestId: string): boolean {
  const job = active.get(requestId);
  if (!job) {
    return false;
  }
  job.cancelled = true;
  job.signal.cancelled = true;
  // 真实适配器完成清理后才释放账号；stub 没有外部资源，可以立即结束。
  if (!job.stub) {
    return true;
  }
  job.settled = true;
  active.delete(requestId);
  job.onResult({
    requestId: job.requestId,
    targetId: job.targetId,
    ok: false,
    error: 'cancelled',
    errorCode: 'cancelled',
    platform: job.platform,
  });
  return true;
}

function runStubPublish(options: {
  payload: PlatformPublishStartPayload;
  job: ActivePublish;
  onProgress: ProgressFn;
  finish: (result: PlatformPublishResultPayload) => void;
}): void {
  const { payload, job, onProgress, finish } = options;
  const emit = (
    phase: PlatformPublishProgressPayload['phase'],
    message?: string,
  ) => {
    if (job.cancelled) {
      return;
    }
    onProgress({
      requestId: payload.requestId,
      targetId: payload.targetId,
      platform: payload.platform,
      phase,
      message,
    });
  };

  emit('accepted');
  const steps: Array<{
    phase: PlatformPublishProgressPayload['phase'];
    delayMs: number;
    message: string;
  }> = [
    { phase: 'fetching_media', delayMs: 50, message: 'stub fetch' },
    { phase: 'opening_creator', delayMs: 50, message: 'stub open' },
    { phase: 'uploading', delayMs: 50, message: 'stub upload' },
    { phase: 'submitting', delayMs: 50, message: 'stub submit' },
  ];

  let i = 0;
  const runNext = () => {
    if (job.cancelled || job.settled) {
      return;
    }
    if (i >= steps.length) {
      emit('done');
      finish({
        requestId: payload.requestId,
        targetId: payload.targetId,
        ok: true,
        platform: payload.platform,
        platformPostId: `stub-${payload.targetId.slice(0, 8)}`,
        platformUrl: 'https://www.douyin.com/stub',
      });
      return;
    }
    const step = steps[i];
    i += 1;
    emit(step.phase, step.message);
    setTimeout(runNext, step.delayMs);
  };
  setTimeout(runNext, 20);
}
