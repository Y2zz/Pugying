/**
 * 小红书图文：Cookie 直调 permit/ROS 上传与 edith 签名发帖（无隐藏窗）。
 */
import type {
  PlatformPublishProgressPayload,
  PlatformPublishResultPayload,
  PlatformPublishStartPayload,
} from "../publish-protocol";
import { ArticleApiError, assertArticleActive } from "./article-api";
import {
  XiaohongshuGraphicClient,
  xiaohongshuGraphicPostId,
} from "./xiaohongshu-graphic-client";

export interface XiaohongshuGraphicPublishOptions {
  payload: PlatformPublishStartPayload;
  onProgress: (progress: PlatformPublishProgressPayload) => void;
  signal: { cancelled: boolean };
  createClient?: (
    options: XiaohongshuGraphicPublishOptions,
  ) => Promise<XiaohongshuGraphicClient> | XiaohongshuGraphicClient;
}

const DECLARATIONS: Record<string, number> = {
  none: 0,
  fictional: 1,
  ai_generated: 2,
  marketing: 3,
  reposted: 5,
};

export async function runXiaohongshuGraphicPublish(
  options: XiaohongshuGraphicPublishOptions,
): Promise<PlatformPublishResultPayload> {
  const { payload, signal, onProgress } = options;
  const base = {
    requestId: payload.requestId,
    targetId: payload.targetId,
    platform: "xiaohongshu" as const,
  };
  const emit = (
    phase: PlatformPublishProgressPayload["phase"],
    message: string,
  ) => {
    assertArticleActive(signal);
    onProgress({ ...base, phase, message });
  };
  let client: XiaohongshuGraphicClient | undefined;
  let submitted = false;
  try {
    emit("accepted", "准备发布图文");
    const title = payload.title.trim();
    const body = payload.body?.trim() ?? "";
    const paths = (
      payload.mediaPaths ?? (payload.mediaPath ? [payload.mediaPath] : [])
    ).map((path) => path.trim());
    const visibility = payload.visibility ?? "public";
    const declaration = payload.authorDeclaration ?? "none";
    if (
      payload.platform !== "xiaohongshu" ||
      !title ||
      title.length > 20 ||
      !body ||
      body.length > 1000 ||
      paths.length < 1 ||
      paths.length > 18 ||
      paths.some((path) => !path) ||
      !["public", "private"].includes(visibility) ||
      (payload.tags?.length ?? 0) > 0 ||
      !(declaration in DECLARATIONS)
    ) {
      throw new ArticleApiError("invalid_payload", "请检查图文内容和发布设置");
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
    client =
      (await options.createClient?.(options)) ??
      new XiaohongshuGraphicClient(payload.cookies);
    const images = [];
    // 每个槽位对应一个上传结果；同一路径多次出现也保留用户槽位顺序
    for (const path of paths) {
      emit("uploading", `上传图片 ${images.length + 1}/${paths.length}`);
      assertArticleActive(signal);
      images.push(await client.uploadImage(path));
    }
    const data = {
      common: {
        type: "normal",
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
          notePostTiming: {
            postTime: time,
          },
          userDeclarationBind: { origin: DECLARATIONS[declaration] },
        }),
      },
      image_info: {
        images: images.map((image) => ({
          file_id: image.uri,
          width: image.width,
          height: image.height,
          metadata: { source: -1, image_template: null },
          stickers: { version: 2, floating: [] },
        })),
      },
      video_info: null,
    };
    emit("submitting", "提交图文");
    submitted = true;
    const created = await client.createNote(data);
    const platformPostId = xiaohongshuGraphicPostId(created);
    try {
      onProgress({ ...base, phase: "done", message: "图文已提交" });
    } catch {
      // 回执已确认，进度接收失败不改变发布结果。
    }
    return {
      ...base,
      ok: true,
      platformPostId,
      platformUrl: `https://www.xiaohongshu.com/explore/${platformPostId}`,
    };
  } catch (error) {
    const known = error instanceof ArticleApiError;
    return {
      ...base,
      ok: false,
      errorCode: known
        ? error.code
        : submitted
          ? "PUBLISH_RESULT_UNKNOWN"
          : "PUBLISH_FAILED",
      error: known
        ? error.message
        : submitted
          ? "尚未确认发布结果，请先到平台查看"
          : "图文发布未成功，请稍后重试",
    };
  } finally {
    await client?.dispose().catch(() => {});
  }
}
