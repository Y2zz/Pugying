import { promises as fs } from 'fs';
import type {
  PlatformPublishProgressPayload,
  PlatformPublishResultPayload,
  PlatformPublishStartPayload,
} from '../publish-protocol';
import { DouyinHttpClient, DouyinHttpError } from './douyin-http-client';

type ProgressFn = (progress: PlatformPublishProgressPayload) => void;

export interface DouyinHttpMediaFiles {
  videoPath: string;
  coverPath: string;
  coverLandscapePath: string;
}

export interface DouyinHttpPipelineResult {
  platformPostId?: string;
  platformUrl?: string;
}

/**
 * 抓包对齐后的映射模块实现此接口。创作者中心后台 HTTP 不是开放平台官方契约，
 * endpoint、载荷和签名都易变，必须以用户自有已授权账号的实际网络请求为准。
 */
export interface DouyinHttpPublishPipeline {
  publish(options: {
    payload: PlatformPublishStartPayload;
    media: DouyinHttpMediaFiles;
    client: DouyinHttpClient;
    signal: { cancelled: boolean };
    onProgress: ProgressFn;
  }): Promise<DouyinHttpPipelineResult>;
}

export const DOUYIN_HTTP_NOT_CONFIGURED = 'HTTP_PIPELINE_NOT_CONFIGURED';

/**
 * HTTP 发布：校验本机视频/封面路径后交给映射流水线。
 * 未注入流水线时明确失败，绝不把“尚未配置”当作发布成功。
 */
export async function runDouyinHttpPublish(options: {
  payload: PlatformPublishStartPayload;
  onProgress: ProgressFn;
  signal: { cancelled: boolean };
  pipeline?: DouyinHttpPublishPipeline;
}): Promise<PlatformPublishResultPayload> {
  const { payload, onProgress, signal, pipeline } = options;
  const base = {
    requestId: payload.requestId,
    targetId: payload.targetId,
    platform: payload.platform,
  };
  const emit = (
    phase: PlatformPublishProgressPayload['phase'],
    message?: string,
  ) => {
    if (!signal.cancelled) {
      onProgress({ ...base, phase, message });
    }
  };

  emit('accepted', '已进入抖音 HTTP 发布策略');
  if (!pipeline) {
    return fail(
      base,
      DOUYIN_HTTP_NOT_CONFIGURED,
      '抖音 HTTP 发布流水线尚未配置；请先按自有账号抓包结果补齐接口映射',
    );
  }

  try {
    if (signal.cancelled) {
      return fail(base, 'cancelled', '已取消');
    }

    emit('fetching_media', '校验本机视频与封面文件');
    const videoPath = payload.mediaPath?.trim() ?? '';
    const coverPath = payload.coverPath?.trim() ?? '';
    const coverLandscapePath = payload.coverLandscapePath?.trim() ?? '';
    if (!videoPath) {
      return fail(base, 'invalid_payload', '请先选择视频文件');
    }
    const media: DouyinHttpMediaFiles = {
      videoPath,
      coverPath,
      coverLandscapePath,
    };
    await Promise.all([
      assertReadable(media.videoPath),
      ...(media.coverPath ? [assertReadable(media.coverPath)] : []),
      ...(media.coverLandscapePath
        ? [assertReadable(media.coverLandscapePath)]
        : []),
    ]);

    if (signal.cancelled) {
      return fail(base, 'cancelled', '已取消');
    }

    emit('opening_creator', '连接创作者中心后台 HTTP（Cookie 会话）');
    const result = await pipeline.publish({
      payload,
      media,
      client: new DouyinHttpClient(payload.cookies),
      signal,
      onProgress,
    });
    if (signal.cancelled) {
      return fail(base, 'cancelled', '已取消');
    }

    emit('done', '发布完成');
    return { ...base, ok: true, ...result };
  } catch (error) {
    if (error instanceof DouyinHttpError) {
      return fail(base, error.code, error.message);
    }
    const message = error instanceof Error ? error.message : String(error);
    if (signal.cancelled || message === 'cancelled') {
      return fail(base, 'cancelled', '已取消');
    }
    if (message.startsWith('MEDIA_MISSING:')) {
      return fail(
        base,
        'MEDIA_MISSING',
        message.replace(/^MEDIA_MISSING:\s*/, '') ||
          '源文件不可用，请重新选择视频或封面',
      );
    }
    return fail(base, 'PUBLISH_FAILED', message);
  }
}

function fail(
  base: { requestId: string; targetId: string; platform: string },
  errorCode: string,
  error: string,
): PlatformPublishResultPayload {
  return { ...base, ok: false, errorCode, error };
}

async function assertReadable(filePath: string): Promise<void> {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`MEDIA_MISSING: 源文件不可用，请重新选择：${filePath}`);
  }
}
