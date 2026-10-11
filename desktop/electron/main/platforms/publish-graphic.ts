import type {
  PlatformPublishProgressPayload,
  PlatformPublishResultPayload,
  PlatformPublishStartPayload,
} from "../publish-protocol";

export interface PlatformGraphicPublishOptions {
  payload: PlatformPublishStartPayload;
  onProgress: (progress: PlatformPublishProgressPayload) => void;
  signal: { cancelled: boolean };
}

export { toutiaoGraphicText } from "./publish-toutiao-graphic";

export async function runPlatformGraphicPublish(
  options: PlatformGraphicPublishOptions,
): Promise<PlatformPublishResultPayload> {
  const { payload } = options;
  if (payload.platform === "douyin") {
    const { runDouyinGraphicPublish } =
      await import("./publish-douyin-graphic");
    return runDouyinGraphicPublish(options);
  }
  if (payload.platform === "channels") {
    const { runChannelsGraphicPublish } =
      await import("./publish-channels-graphic");
    return runChannelsGraphicPublish(options);
  }
  if (payload.platform === "toutiao") {
    const { runToutiaoGraphicPublish } =
      await import("./publish-toutiao-graphic");
    return runToutiaoGraphicPublish(options);
  }
  if (payload.platform === "xiaohongshu") {
    const { runXiaohongshuGraphicPublish } =
      await import("./publish-xiaohongshu-graphic");
    return runXiaohongshuGraphicPublish(options);
  }
  return {
    requestId: payload.requestId,
    targetId: payload.targetId,
    platform: payload.platform,
    ok: false,
    errorCode: "unsupported_platform",
    error: "该平台暂不支持图文发布",
  };
}
