/**
 * 头条微头条图文：Cookie 直调 spice 上传与 wtt 提交（无隐藏窗）。
 */
import type {
  PlatformPublishProgressPayload,
  PlatformPublishResultPayload,
  PlatformPublishStartPayload,
} from "../publish-protocol";
import { ArticleApiError, assertArticleActive } from "./article-api";
import {
  ToutiaoGraphicClient,
  toutiaoGraphicPostId,
} from "./toutiao-graphic-client";

/** 微头条没有独立标题，标题作为文案首行保留。 */
export function toutiaoGraphicText(title: string, body: string): string {
  return [title.trim(), body.trim()].filter(Boolean).join("\n\n");
}

export interface ToutiaoGraphicPublishOptions {
  payload: PlatformPublishStartPayload;
  onProgress: (progress: PlatformPublishProgressPayload) => void;
  signal: { cancelled: boolean };
  createClient?: (
    options: ToutiaoGraphicPublishOptions,
  ) => Promise<ToutiaoGraphicClient> | ToutiaoGraphicClient;
}

const SOURCE_TYPE: Record<string, number> = {
  none: -1,
  ai_generated: 3,
  personal_opinion: 5,
  reposted: 4,
  fictional: 6,
};

export async function runToutiaoGraphicPublish(
  options: ToutiaoGraphicPublishOptions,
): Promise<PlatformPublishResultPayload> {
  const { payload, signal, onProgress } = options;
  const base = {
    requestId: payload.requestId,
    targetId: payload.targetId,
    platform: "toutiao" as const,
  };
  const emit = (
    phase: PlatformPublishProgressPayload["phase"],
    message: string,
  ) => {
    assertArticleActive(signal);
    onProgress({ ...base, phase, message });
  };
  let client: ToutiaoGraphicClient | undefined;
  let submitted = false;
  try {
    emit("accepted", "准备发布图文");
    const title = payload.title.trim();
    const body = payload.body?.trim() ?? "";
    const paths = (
      payload.mediaPaths ?? (payload.mediaPath ? [payload.mediaPath] : [])
    ).map((path) => path.trim());
    const text = toutiaoGraphicText(title, body);
    const declaration = payload.authorDeclaration ?? "none";
    if (
      payload.platform !== "toutiao" ||
      !title ||
      title.length > 100 ||
      !body ||
      text.length > 2000 ||
      paths.length < 1 ||
      paths.length > 18 ||
      paths.some((path) => !path) ||
      payload.visibility === "private" ||
      payload.scheduledAt ||
      (payload.tags?.length ?? 0) > 0 ||
      !(declaration in SOURCE_TYPE)
    ) {
      throw new ArticleApiError("invalid_payload", "请检查图文内容和发布设置");
    }
    emit("opening_creator", "连接发布平台");
    client =
      (await options.createClient?.(options)) ??
      new ToutiaoGraphicClient(payload.cookies);
    const images = [];
    for (const path of paths) {
      emit("uploading", `上传图片 ${images.length + 1}/${paths.length}`);
      assertArticleActive(signal);
      images.push(await client.uploadImage(path));
    }
    emit("submitting", "提交图文");
    submitted = true;
    const response = await client.createWtt({
      content: text,
      image_list: images.map((image) => image.uri),
      pre_upload: 1,
      entrance: "main",
      extra: JSON.stringify({
        info_source: JSON.stringify({
          source_type: SOURCE_TYPE[declaration],
          source_author_uid: "",
        }),
      }),
    });
    const platformPostId = toutiaoGraphicPostId(response);
    try {
      onProgress({ ...base, phase: "done", message: "图文已提交" });
    } catch {
      // 回执已确认，进度接收失败不改变发布结果。
    }
    return {
      ...base,
      ok: true,
      platformPostId,
      platformUrl: `https://www.toutiao.com/w/${platformPostId}/`,
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
