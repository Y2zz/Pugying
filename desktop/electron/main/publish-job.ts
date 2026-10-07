import { DEFAULT_DISTRIBUTION_CONCURRENCY } from "../../shared/distribution";
import { prepareArticleDocument } from "./article-publish-format";
import type {
  PlatformPublishContentType,
  PlatformPublishProgressPayload,
  PlatformPublishResultPayload,
  PlatformPublishStartPayload,
} from "./publish-protocol";

type ProgressFn = (progress: PlatformPublishProgressPayload) => void;
type ResultFn = (result: PlatformPublishResultPayload) => void;

interface ActivePublish {
  requestId: string;
  targetId: string;
  platform: string;
  accountId: string;
  cancelled: boolean;
  settled: boolean;
  signal: { cancelled: boolean };
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
  if (payload.contentType === "graphic") {
    return "graphic";
  }
  if (payload.contentType === "article") {
    return "article";
  }
  return "video";
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
  if (
    contentType === "graphic" &&
    payload.platform === "douyin" &&
    !payload.coverPath?.trim()
  ) {
    return false;
  }
  if (contentType === "graphic") {
    const paths = (payload.mediaPaths ?? [])
      .map((p) => p.trim())
      .filter(Boolean);
    const fallback = payload.mediaPath?.trim();
    return paths.length > 0 || Boolean(fallback);
  }

  if (contentType === "article") {
    return (
      Boolean(payload.body?.trim()) &&
      (payload.platform !== "douyin" || Boolean(payload.coverPath?.trim()))
    );
  }

  return Boolean(payload.mediaPath?.trim());
}

/**
 * Validates payload, enforces app concurrency and account isolation, then runs the adapter.
 * 文章、图文和视频始终调用真实适配器；测试在边界注入 mock。
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
    return { error: "busy" };
  }
  if (!isValidPublishPayload(payload)) {
    return { error: "invalid_payload" };
  }

  const contentType = resolveContentType(payload);
  if (
    payload.platform !== "douyin" &&
    !(
      contentType === "article" &&
      ["toutiao", "bilibili"].includes(payload.platform)
    ) &&
    !(
      contentType === "graphic" &&
      ["toutiao", "xiaohongshu"].includes(payload.platform)
    ) &&
    !(
      contentType === "video" &&
      ["xiaohongshu", "toutiao", "bilibili"].includes(payload.platform)
    )
  ) {
    return { error: "unsupported_platform" };
  }

  const signal = { cancelled: false };
  const job: ActivePublish = {
    requestId: payload.requestId,
    targetId: payload.targetId,
    platform: payload.platform,
    accountId: payload.accountId,
    cancelled: false,
    settled: false,
    signal,
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

  const { body: articleHtml, ...articlePayload } = payload;
  const runAdapter =
    contentType === "graphic"
      ? () =>
          import("./platforms/publish-graphic").then(
            ({ runPlatformGraphicPublish }) =>
              runPlatformGraphicPublish({
                payload,
                onProgress: options.onProgress,
                signal,
              }),
          )
      : contentType === "article"
        ? () =>
            import("./platforms/publish-article").then(
              ({ runPlatformArticlePublish }) =>
                runPlatformArticlePublish({
                  payload: articlePayload,
                  article: prepareArticleDocument(
                    articleHtml || "",
                    payload.mediaPaths || [],
                  ),
                  onProgress: options.onProgress,
                  signal,
                }),
            )
        : payload.platform === "xiaohongshu"
          ? () =>
              import("./platforms/publish-xiaohongshu-video").then(
                ({ runXiaohongshuVideoPublish }) =>
                  runXiaohongshuVideoPublish({
                    payload,
                    onProgress: options.onProgress,
                    signal,
                  }),
              )
          : payload.platform === "toutiao"
            ? () =>
                import("./platforms/publish-toutiao-video").then(
                  ({ runToutiaoVideoPublish }) =>
                    runToutiaoVideoPublish({
                      payload,
                      onProgress: options.onProgress,
                      signal,
                    }),
                )
            : payload.platform === "bilibili"
              ? () =>
                  import("./platforms/publish-bilibili-video").then(
                    ({ runBilibiliVideoPublish }) =>
                      runBilibiliVideoPublish({
                        payload,
                        onProgress: options.onProgress,
                        signal,
                      }),
                  )
              : () =>
                  import("./platforms/publish-douyin-http").then(
                    ({ runDouyinHttpPublish }) =>
                      runDouyinHttpPublish({
                        payload,
                        onProgress: options.onProgress,
                        signal,
                      }),
                  );

  void runAdapter()
    .then((result) => {
      if (
        (job.cancelled || signal.cancelled) &&
        !(result.ok || result.errorCode === "PUBLISH_RESULT_UNKNOWN")
      ) {
        finish({
          requestId: payload.requestId,
          targetId: payload.targetId,
          ok: false,
          error: "cancelled",
          errorCode: "cancelled",
          platform: payload.platform,
        });
        return;
      }
      finish(result);
    })
    .catch(() => {
      finish({
        requestId: payload.requestId,
        targetId: payload.targetId,
        ok: false,
        error:
          contentType === "article"
            ? "文章发布未成功，请检查正文和图片后重试"
            : contentType === "graphic"
              ? "图文发布未成功，请检查文案和图片后重试"
              : "视频发布未成功，请检查视频后重试",
        errorCode: job.cancelled ? "cancelled" : "PUBLISH_FAILED",
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
  // 等待适配器确认回执并完成清理后才释放账号，避免取消时重复提交。
  return true;
}
