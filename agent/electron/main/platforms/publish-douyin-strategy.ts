import type {
  PlatformPublishResultPayload,
  PlatformPublishStartPayload,
} from '../publish-protocol';
import { runDouyinDomPublish } from './publish-douyin-dom';
import {
  runDouyinHttpPublish,
  type DouyinHttpPublishPipeline,
} from './publish-douyin-http';

export type DouyinPublishMode = 'dom' | 'http' | 'http_then_dom';

type PublishOptions = {
  payload: PlatformPublishStartPayload;
  onProgress: Parameters<typeof runDouyinDomPublish>[0]['onProgress'];
  signal: { cancelled: boolean };
};

export interface DouyinPublishDependencies {
  runDom: typeof runDouyinDomPublish;
  runHttp: (
    options: PublishOptions & { pipeline?: DouyinHttpPublishPipeline },
  ) => Promise<PlatformPublishResultPayload>;
  httpPipeline?: DouyinHttpPublishPipeline;
}

const defaultDependencies: DouyinPublishDependencies = {
  runDom: runDouyinDomPublish,
  runHttp: runDouyinHttpPublish,
};

/** 未设置时保持既有 DOM 行为；非法值明确报错，避免配置拼写错误被静默忽略。 */
export function resolveDouyinPublishMode(
  value = process.env.PUGYING_DOUYIN_PUBLISH_MODE,
): DouyinPublishMode {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return 'dom';
  }
  if (
    normalized === 'dom' ||
    normalized === 'http' ||
    normalized === 'http_then_dom'
  ) {
    return normalized;
  }
  throw new Error(
    `PUGYING_DOUYIN_PUBLISH_MODE 配置无效：${value}（仅支持 dom/http/http_then_dom）`,
  );
}

/** 根据本机环境变量分发发布策略，Cookie 与具体执行始终留在 Agent 主进程。 */
export async function runDouyinPublishByMode(
  options: PublishOptions,
  dependencies: DouyinPublishDependencies = defaultDependencies,
): Promise<PlatformPublishResultPayload> {
  const mode = resolveDouyinPublishMode();
  if (mode === 'dom') {
    return dependencies.runDom(options);
  }

  const httpResult = await dependencies.runHttp({
    ...options,
    pipeline: dependencies.httpPipeline,
  });
  if (mode === 'http' || httpResult.ok || options.signal.cancelled) {
    return httpResult;
  }

  options.onProgress({
    requestId: options.payload.requestId,
    targetId: options.payload.targetId,
    platform: options.payload.platform,
    phase: 'opening_creator',
    message: `HTTP 发布未完成（${httpResult.errorCode ?? '未知错误'}），切换 DOM 兜底`,
  });
  return dependencies.runDom(options);
}
