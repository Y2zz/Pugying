import { appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  PlatformPublishResultPayload,
  PlatformPublishStartPayload,
} from "../publish-protocol";
import {
  ArticleApiError,
  articleRecord,
  assertArticleActive,
} from "./article-api";
import type { CookiePublishSessionOptions } from "./article-api-session";
import type { VideoApiSession } from "./video-api";
import { parseBilibiliVideoOptions } from "@shared/bilibili-video-settings";
import {
  buildBilibiliVideoSubmission,
  parseBilibiliVideoReceipt,
} from "./bilibili-video-contract";

const SUBMIT_DIAG = join(tmpdir(), "pugying-xhs-upload-diag.log");

interface Options extends CookiePublishSessionOptions {
  payload: PlatformPublishStartPayload;
  createSession?: (
    platform: "bilibili",
    options: CookiePublishSessionOptions,
  ) => Promise<VideoApiSession>;
}

export async function runBilibiliVideoPublish(
  options: Options,
): Promise<PlatformPublishResultPayload> {
  const { payload, signal, onProgress } = options;
  const base = {
    requestId: payload.requestId,
    targetId: payload.targetId,
    platform: payload.platform,
  };
  let api: VideoApiSession | undefined;
  let submitted = false;
  const emit = (
    phase: Parameters<typeof onProgress>[0]["phase"],
    message: string,
  ) => {
    assertArticleActive(signal);
    onProgress({ ...base, phase, message });
  };
  try {
    emit("accepted", "准备发布视频");
    const settings = payload.bilibiliVideoSettings;
    const paths =
      payload.mediaPaths ?? (payload.mediaPath ? [payload.mediaPath] : []);
    const coverPath = payload.coverLandscapePath || payload.coverPath;
    const visibility = payload.visibility ?? "public";
    if (
      payload.platform !== "bilibili" ||
      paths.length !== 1 ||
      !paths[0] ||
      !coverPath ||
      !settings ||
      !["public", "private"].includes(visibility)
    ) {
      throw new ArticleApiError(
        "invalid_payload",
        "请检查视频、封面和发布设置",
      );
    }
    // 上传前检查所有静态参数，上传占位值仅用于验证，不提交。
    const input = {
      title: payload.title,
      description: payload.body ?? "",
      tags: payload.tags ?? [],
      ...settings,
      visibility: visibility as "public" | "private",
      scheduledAt: payload.scheduledAt,
    };
    buildBilibiliVideoSubmission({
      ...input,
      coverUrl: "pending",
      filename: "pending",
      cid: "1",
    });
    if (
      (payload.authorDeclaration ?? "none") !== "none" &&
      !settings.creationStatementId
    ) {
      throw new ArticleApiError("invalid_payload", "请重新选择创作声明");
    }
    emit("opening_creator", "连接发布平台");
    const factory =
      options.createSession ??
      (await import("./article-api-session")).createArticleApiSession;
    api = await factory("bilibili", options);
    const config = await api.request("/x/vupre/web/archive/pre");
    if (config.code !== 0 || articleRecord(config.data).isLogin !== true) {
      throw new ArticleApiError("AUTH_EXPIRED", "账号登录已失效，请重新授权");
    }
    const current = parseBilibiliVideoOptions(config.data);
    if (
      !current?.partitions.some((item) => item.id === settings.partitionId) ||
      (settings.creationStatementId !== undefined &&
        !current.declarations.some(
          (item) => item.id === settings.creationStatementId,
        ))
    ) {
      throw new ArticleApiError(
        "invalid_payload",
        "分区或创作声明已变化，请重新选择",
      );
    }
    emit("uploading", "上传视频与封面");
    const video = await api.uploadVideo(paths[0]);
    const cover = await api.uploadImage(coverPath);
    const data = buildBilibiliVideoSubmission({
      ...input,
      filename: video.fileId ?? "",
      cid: video.vid,
      coverUrl: cover.url,
    });
    emit("submitting", "提交视频");
    submitted = true;
    const response = await api.request("/x/vu/web/add/v3", data);
    // 投稿失败时保留平台业务码到诊断日志，用户文案仍走克制映射。
    try {
      appendFileSync(
        SUBMIT_DIAG,
        `${new Date().toISOString()} bilibili submit response=${JSON.stringify({
          code: (response as { code?: unknown })?.code,
          message: (response as { message?: unknown })?.message,
          keys:
            response && typeof response === "object"
              ? Object.keys(response)
              : [],
          payloadKeys: Object.keys(data),
          tid: (data as { tid?: unknown }).tid,
          cover: String((data as { cover?: unknown }).cover ?? "").slice(0, 80),
          filename: (data as { videos?: { filename?: string }[] }).videos?.[0]
            ?.filename,
          cid: (data as { videos?: { cid?: string }[] }).videos?.[0]?.cid,
          is_only_self: (data as { is_only_self?: unknown }).is_only_self,
          creation_statement: (data as { creation_statement?: unknown })
            .creation_statement,
        })}\n`,
      );
    } catch {
      /* 诊断落盘失败不影响投稿 */
    }
    const receipt = parseBilibiliVideoReceipt(response);
    try {
      onProgress({ ...base, phase: "done", message: "视频已提交" });
    } catch {
      /* 成功回执不受通知失败影响。 */
    }
    return {
      ...base,
      ok: true,
      platformPostId: receipt.bvid,
      platformUrl: receipt.platformPostUrl,
    };
  } catch (error) {
    return {
      ...base,
      ok: false,
      errorCode:
        error instanceof ArticleApiError
          ? error.code
          : submitted
            ? "PUBLISH_RESULT_UNKNOWN"
            : "PUBLISH_FAILED",
      error:
        error instanceof ArticleApiError
          ? error.message
          : submitted
            ? "尚未确认发布结果，请先到平台查看"
            : "视频发布未成功，请稍后重试",
    };
  } finally {
    await api?.dispose().catch(() => {});
  }
}
