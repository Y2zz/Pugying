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

interface Options extends CookiePublishSessionOptions {
  payload: PlatformPublishStartPayload;
  createSession?: (
    platform: "xiaohongshu",
    options: CookiePublishSessionOptions,
  ) => Promise<VideoApiSession>;
}

/** 官方视频笔记结构：上传文件、原始轨道与封面分别提交，不复用图文图片列表。 */
export async function runXiaohongshuVideoPublish(
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
    const title = payload.title.trim();
    const body = payload.body?.trim() ?? "";
    const paths =
      payload.mediaPaths ?? (payload.mediaPath ? [payload.mediaPath] : []);
    const visibility = payload.visibility ?? "public";
    const declaration = payload.authorDeclaration ?? "none";
    const declarations: Record<string, number> = {
      none: 0,
      fictional: 1,
      ai_generated: 2,
      marketing: 3,
      reposted: 5,
    };
    if (
      payload.platform !== "xiaohongshu" ||
      !title ||
      title.length > 20 ||
      body.length > 1000 ||
      paths.length !== 1 ||
      !paths[0] ||
      !["public", "private"].includes(visibility) ||
      !(declaration in declarations) ||
      (payload.tags?.length ?? 0) > 0
    ) {
      throw new ArticleApiError("invalid_payload", "请检查视频内容和发布设置");
    }
    const time = payload.scheduledAt
      ? new Date(payload.scheduledAt).getTime()
      : undefined;
    if (
      time !== undefined &&
      (!Number.isFinite(time) ||
        time < Date.now() + 3600000 ||
        time > Date.now() + 14 * 86400000)
    ) {
      throw new ArticleApiError("invalid_payload", "请重新设置发布时间");
    }
    emit("opening_creator", "连接发布平台");
    const factory =
      options.createSession ??
      (await import("./article-api-session")).createArticleApiSession;
    api = await factory("xiaohongshu", options);
    emit("uploading", "上传视频");
    const video = await api.uploadVideo(paths[0]);
    if (!video.fileId || !video.originalMetadata || !video.coverUri) {
      throw new ArticleApiError(
        "ARTICLE_API_CHANGED",
        "未能确认视频上传结果，请稍后重试",
      );
    }
    // 视频笔记封面使用官方转码回执中的首帧；图片上传通道的 fileId 会被投稿接口以 -1 拒绝。
    emit("uploading", "处理封面");
    const coverId = video.coverUri;
    // 官方 MediaInfo 可能给出 "0.000" 等小数串；投稿接口要求 rotation 等为整数。
    const normalizeTrack = (track: unknown): Record<string, unknown> | null => {
      if (!track || typeof track !== "object") {
        return null;
      }
      const next: Record<string, unknown> = {
        ...(track as Record<string, unknown>),
      };
      for (const key of ["Rotation", "rotation"]) {
        if (next[key] == null || next[key] === "") {
          continue;
        }
        const value = Number(next[key]);
        next[key] = Number.isFinite(value) ? Math.round(value) : 0;
      }
      return next;
    };
    const meta = video.originalMetadata as {
      video?: Record<string, unknown>;
      audio?: Record<string, unknown> | null;
    };
    const videoTrack = normalizeTrack(meta.video) ?? normalizeTrack(meta) ?? {};
    const audioTrack = normalizeTrack(meta.audio);
    const compositeMeta = {
      video: videoTrack,
      audio: audioTrack,
    };
    // 片段轨元数据用规范化后的视频轨；合成信息保持 video/audio 包装供官方 toSnakeCase。
    const trackMeta = videoTrack;
    const data = {
      common: {
        type: "video",
        note_id: "",
        source: JSON.stringify({ type: "web", ids: "" }),
        title,
        desc: body,
        ats: [],
        hash_tag: [],
        privacy_info: {
          op_type: 1,
          type: visibility === "private" ? 1 : 0,
          user_ids: [],
        },
        business_binds: JSON.stringify({
          version: 1,
          bizType: time ? 13 : 0,
          notePostTiming: { postTime: time },
          userDeclarationBind: { origin: declarations[declaration] },
        }),
      },
      image_info: null,
      video_info: {
        file_id: video.fileId,
        format_width: video.width,
        format_height: video.height,
        composite_metadata: compositeMeta,
        timelines: [],
        cover: {
          file_id: coverId,
          width: video.width,
          height: video.height,
          stickers: { version: 2, floating: [] },
          frame: { ts: 0, is_upload: false, is_user_select: false },
        },
        chapters: [],
        summary: "",
        chapter_sync_text: false,
        segments: {
          count: 1,
          need_slice: false,
          items: [
            {
              mute: 0,
              speed: 1,
              start: 0,
              duration: video.duration,
              transcoded: 0,
              media_source: 1,
              original_metadata: trackMeta,
            },
          ],
        },
        entrance: "web",
        replaced_video: false,
        pk_cover_biz_relations: [],
      },
    };
    if (time !== undefined && time < Date.now() + 3600000) {
      throw new ArticleApiError(
        "invalid_payload",
        "上传期间发布时间已临近，请重新设置",
      );
    }
    emit("submitting", "提交视频");
    submitted = true;
    const response = await api.request("/web_api/sns/v2/note", data);
    if (
      (response.code !== 0 && response.code !== "N/A") ||
      response.success !== true
    ) {
      try {
        const { appendFileSync } = await import("node:fs");
        const { tmpdir } = await import("node:os");
        const { join } = await import("node:path");
        appendFileSync(
          join(tmpdir(), "pugying-xhs-upload-diag.log"),
          `${new Date().toISOString()} note reject code=${String(response?.code)} success=${String(response?.success)} msg=${String(response?.msg ?? response?.message ?? "").slice(0, 200)} data=${JSON.stringify(response?.data ?? null).slice(0, 300)} keys=${Object.keys(response || {}).join(",")} metaKeys=${Object.keys(trackMeta || {}).join(",")}\n`,
        );
      } catch {
        /* 诊断落盘失败不影响错误本身 */
      }
      if (response.code === -100 || response.code === -10001) {
        throw new ArticleApiError("AUTH_EXPIRED", "账号登录已失效，请重新授权");
      }
      if (typeof response.code !== "number" || response.code === 0) {
        throw new ArticleApiError(
          "PUBLISH_RESULT_UNKNOWN",
          "尚未确认发布结果，请先到平台查看",
        );
      }
      throw new ArticleApiError(
        "PLATFORM_REJECTED",
        "平台未接受本次发布，请到创作者中心查看账号或内容要求",
      );
    }
    const id = articleRecord(response.data).id;
    if (typeof id !== "string" || !/^[a-f0-9]{24}$/.test(id)) {
      throw new ArticleApiError(
        "PUBLISH_RESULT_UNKNOWN",
        "尚未确认发布结果，请先到平台查看",
      );
    }
    try {
      onProgress({ ...base, phase: "done", message: "视频已提交" });
    } catch {
      // 发布回执已确认，进度通知失败不改变结果。
    }
    return {
      ...base,
      ok: true,
      platformPostId: id,
      platformUrl: `https://www.xiaohongshu.com/explore/${id}`,
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
