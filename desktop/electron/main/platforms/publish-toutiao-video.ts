import { basename } from "node:path";
import type {
  PlatformPublishResultPayload,
  PlatformPublishStartPayload,
} from "../publish-protocol";
import {
  ArticleApiError,
  articlePostId,
  articleRecord,
  assertArticleActive,
} from "./article-api";
import type { CookiePublishSessionOptions } from "./article-api-session";
import type { VideoApiSession } from "./video-api";

interface Options extends CookiePublishSessionOptions {
  payload: PlatformPublishStartPayload;
  createSession?: (
    platform: "toutiao",
    options: CookiePublishSessionOptions,
  ) => Promise<VideoApiSession>;
}

/** 当前西瓜视频投稿契约；上传成功不替代投稿回执。 */
export async function runToutiaoVideoPublish(
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
    const paths =
      payload.mediaPaths ?? (payload.mediaPath ? [payload.mediaPath] : []);
    const title = payload.title.trim();
    const body = payload.body?.trim() ?? "";
    const visibility = payload.visibility ?? "public";
    const declaration = payload.authorDeclaration ?? "none";
    const declarations: Record<string, number> = {
      none: 0,
      ai_generated: 3,
      reposted: 4,
      personal_opinion: 5,
      fictional: 6,
    };
    const coverPath = payload.coverLandscapePath || payload.coverPath;
    if (
      payload.platform !== "toutiao" ||
      !title ||
      title.length > 30 ||
      paths.length !== 1 ||
      !paths[0] ||
      !coverPath ||
      !["public", "private"].includes(visibility) ||
      !(declaration in declarations) ||
      (payload.tags?.length ?? 0) > 0
    ) {
      throw new ArticleApiError(
        "invalid_payload",
        "请检查视频内容、封面和发布设置",
      );
    }
    const scheduled = payload.scheduledAt
      ? new Date(payload.scheduledAt).getTime()
      : undefined;
    if (
      scheduled !== undefined &&
      (!Number.isFinite(scheduled) || scheduled <= Date.now())
    ) {
      throw new ArticleApiError("invalid_payload", "请重新设置发布时间");
    }
    emit("opening_creator", "连接发布平台");
    const factory =
      options.createSession ??
      (await import("./article-api-session")).createArticleApiSession;
    api = await factory("toutiao", options);
    const auth = await api.request("/xigua/api/upload/GetPublishAuth");
    if (auth.status === -12) {
      throw new ArticleApiError("AUTH_EXPIRED", "账号登录已失效，请重新授权");
    }
    if (auth.status !== 0) {
      throw new ArticleApiError(
        "PLATFORM_REJECTED",
        "该账号暂时无法发布视频，请到创作者中心查看",
      );
    }
    const authData = articleRecord(auth.data);
    if (articleRecord(authData.authorPermission).DisablePublish === true) {
      throw new ArticleApiError(
        "PLATFORM_REJECTED",
        "该账号暂时无法发布视频，请到创作者中心查看",
      );
    }
    emit("uploading", "上传视频");
    const video = await api.uploadVideo(paths[0]);
    const config = articleRecord(authData.authorConfig);
    const portrait = video.width < video.height;
    const min = config[portrait ? "TtVideoTitleLenMin" : "XgVideoTitleLenMin"];
    const max = config[portrait ? "TtVideoTitleLenMax" : "XgVideoTitleLenMax"];
    if (
      typeof min !== "number" ||
      typeof max !== "number" ||
      title.length < min ||
      title.length > max
    ) {
      throw new ArticleApiError(
        "invalid_payload",
        "标题不符合该账号的视频要求，请调整后再发布",
      );
    }
    const cover = await api.uploadImage(coverPath);
    const source = declarations[declaration];
    const compliance = source
      ? {
          IsAIGC: source === 3,
          ComplianceType:
            source === 3 ? 3 : source === 6 || source === 5 ? source : 2,
          ...(source === 4 ? { MaterialInfo: { MaterialSource: 2 } } : {}),
        }
      : undefined;
    const upload = (video as { uploadResult?: Record<string, unknown> })
      .uploadResult;
    const provider =
      (video as { provider?: unknown }).provider ??
      upload?.Provider ??
      upload?.provider;
    try {
      const { appendFileSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");
      appendFileSync(
        join(tmpdir(), "pugying-toutiao-video-diag.log"),
        `${new Date().toISOString()} upload keys=${upload ? Object.keys(upload).join(",") : ""} provider=${String(provider ?? "")} uri=${String(upload?.Uri ?? "").slice(0, 80)} mid=${String(upload?.Mid ?? "")} meta=${JSON.stringify(upload?.VideoMeta ?? null).slice(0, 400)} vid=${String(video.vid).slice(0, 48)}\n`,
      );
    } catch {
      /* 诊断落盘失败不影响发布 */
    }
    const data = {
      ItemId: "",
      Title: title,
      VideoInfo: {
        Vid: video.vid,
        VName: basename(paths[0]),
        ThumbUri: cover.uri,
        ThumbUrl: cover.url,
        Duration: Math.round(Number(video.duration) || 0),
        VideoWidth: video.width,
        VideoHeight: video.height,
        ...(typeof upload?.Uri === "string" && upload.Uri
          ? { Uri: upload.Uri }
          : {}),
        ...(provider != null && provider !== ""
          ? { Provider: provider }
          : {}),
      },
      Abstract: body,
      ClaimOrigin: false,
      Praise: false,
      PublishType: scheduled ? 2 : 1,
      From: "mp",
      EnterFrom: 5,
      IsNew: true,
      VideoType: portrait ? 6 : 3,
      ExternalLink: "",
      Label: [],
      CompassVideo: {
        CompassVideoId: "",
        CompassVideoName: "",
        CompassVideoType: 0,
      },
      CreateSource: 2,
      HideInfo: { HideType: visibility === "private" ? 1 : 0 },
      CoverTitles: [],
      AttrsValueMap: {},
      ...(scheduled ? { TimerTime: Math.floor(scheduled / 1000) } : {}),
      ...(compliance ? { ComplianceInfo: compliance } : {}),
    };
    if (scheduled !== undefined && scheduled <= Date.now()) {
      throw new ArticleApiError(
        "invalid_payload",
        "上传期间发布时间已过，请重新设置",
      );
    }
    emit("submitting", "提交视频");
    submitted = true;
    const response = await api.request("/xigua/api/upload/PublishVideo", data);
    const receipt = articleRecord(response.data);
    if (response.status === -12) {
      throw new ArticleApiError("AUTH_EXPIRED", "账号登录已失效，请重新授权");
    }
    if (response.status !== 0 || receipt.Code !== 0) {
      try {
        const { appendFileSync } = await import("node:fs");
        const { tmpdir } = await import("node:os");
        const { join } = await import("node:path");
        appendFileSync(
          join(tmpdir(), "pugying-toutiao-video-diag.log"),
          `${new Date().toISOString()} publish status=${String(response?.status)} code=${String(receipt?.Code)} msg=${String(receipt?.Message ?? receipt?.Msg ?? response?.message ?? "").slice(0, 200)} keys=${Object.keys(receipt || {}).join(",")} duration=${String(video.duration)} vid=${String(video.vid).slice(0, 40)}\n`,
        );
      } catch {
        /* 诊断落盘失败不影响错误本身 */
      }
      const known =
        (typeof response.status === "number" && response.status !== 0) ||
        (typeof receipt.Code === "number" && receipt.Code !== 0);
      throw new ArticleApiError(
        known ? "PLATFORM_REJECTED" : "PUBLISH_RESULT_UNKNOWN",
        known
          ? "平台未接受本次发布，请到创作者中心查看账号或内容要求"
          : "尚未确认发布结果，请先到平台查看",
      );
    }
    const id = articlePostId(receipt.ItemId);
    try {
      onProgress({ ...base, phase: "done", message: "视频已提交" });
    } catch {
      // 已收到成功回执，通知失败不改变发布结果。
    }
    return {
      ...base,
      ok: true,
      platformPostId: id,
      platformUrl: `https://www.toutiao.com/video/${id}/`,
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
