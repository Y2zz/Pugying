/**
 * 视频号短视频：helper_upload_params → COS 上传视频/封面 → post_clip_video → post_create（mediaType=4）。
 * 仅自己可见：创建后 post_update_visible（visibleType=3）；定时与自主声明尚未对齐。
 */
import type {
  PlatformPublishProgressPayload,
  PlatformPublishResultPayload,
  PlatformPublishStartPayload,
} from '../publish-protocol';
import { ArticleApiError, assertArticleActive } from './article-api';
import {
  CHANNELS_VISIBLE_PRIVATE,
  ChannelsGraphicClient,
  type ChannelsHttpTransport,
} from './channels-graphic-client';

const MAX_DESC = 1000;
const SHORT_TITLE_MIN = 6;
const SHORT_TITLE_MAX = 16;
const MAX_TAGS = 10;

export interface ChannelsVideoPublishOptions {
  payload: PlatformPublishStartPayload;
  onProgress: (progress: PlatformPublishProgressPayload) => void;
  signal: { cancelled: boolean };
  createClient?: (options: {
    cookies: PlatformPublishStartPayload['cookies'];
    transport?: ChannelsHttpTransport;
  }) => ChannelsGraphicClient;
  transport?: ChannelsHttpTransport;
}

/** 简介与话题拼成视频号描述；话题以 # 追加（短标题单独走 shortTitle）。 */
export function channelsVideoDescription(
  body: string,
  tags: string[],
): string {
  const text = body.trim();
  const topicSuffix = tags
    .map((tag) => tag.trim().replace(/^#+/, ''))
    .filter(Boolean)
    .map((tag) => `#${tag}`)
    .join(' ');
  return [text, topicSuffix].filter(Boolean).join(text && topicSuffix ? ' ' : '');
}

export async function runChannelsVideoPublish(
  options: ChannelsVideoPublishOptions,
): Promise<PlatformPublishResultPayload> {
  const { payload, signal, onProgress } = options;
  const base = {
    requestId: payload.requestId,
    targetId: payload.targetId,
    platform: 'channels' as const,
  };
  const emit = (
    phase: PlatformPublishProgressPayload['phase'],
    message: string,
  ) => {
    assertArticleActive(signal);
    onProgress({ ...base, phase, message });
  };

  let submitted = false;
  try {
    emit('accepted', '准备发布视频');
    const shortTitle = payload.title.trim();
    const body = payload.body?.trim() ?? '';
    const paths =
      payload.mediaPaths ?? (payload.mediaPath ? [payload.mediaPath] : []);
    const videoPath = paths[0]?.trim() ?? '';
    const coverPath =
      payload.coverPath?.trim() || payload.coverLandscapePath?.trim() || '';
    const tags = [
      ...new Set(
        (payload.tags ?? [])
          .map((tag) => tag.trim().replace(/^#+/, ''))
          .filter(Boolean),
      ),
    ];
    const description = channelsVideoDescription(body, tags);
    // 测试与日常试发默认仅自己可见，避免误公开
    const visibility = payload.visibility ?? 'private';

    if (
      payload.platform !== 'channels' ||
      shortTitle.length < SHORT_TITLE_MIN ||
      shortTitle.length > SHORT_TITLE_MAX ||
      description.length > MAX_DESC ||
      paths.length !== 1 ||
      !videoPath ||
      !coverPath ||
      tags.length > MAX_TAGS ||
      tags.some((tag) => /\s|#/.test(tag)) ||
      !['public', 'private'].includes(visibility) ||
      payload.scheduledAt ||
      (payload.authorDeclaration && payload.authorDeclaration !== 'none')
    ) {
      throw new ArticleApiError(
        'invalid_payload',
        '请检查视频内容和发布设置',
      );
    }

    emit('opening_creator', '连接发布平台');
    const client =
      options.createClient?.({
        cookies: payload.cookies,
        transport: options.transport,
      }) ??
      new ChannelsGraphicClient(payload.cookies, options.transport);
    await client.prepare();
    assertArticleActive(signal);

    emit('uploading', '上传视频');
    const uploadStarted = Math.floor(Date.now() / 1000);
    const uploadT0 = Date.now();
    const video = await client.uploadVideo(videoPath);
    assertArticleActive(signal);
    emit('uploading', '上传封面');
    const cover = await client.uploadImage(coverPath);
    const uploadEnded = Math.floor(Date.now() / 1000);
    const uploadCostMs = Math.max(1, Date.now() - uploadT0);
    const traceKey = await client.getTraceKey();
    assertArticleActive(signal);

    emit('uploading', '处理视频');
    const clipKey = await client.postClipVideo({
      videoUrl: video.url,
      width: video.width,
      height: video.height,
      duration: video.duration,
      fileSize: video.size,
      traceKey,
      uploadCdnStart: uploadStarted,
      uploadCdnEnd: Math.max(uploadEnded, uploadStarted),
    });
    assertArticleActive(signal);

    emit('submitting', '提交视频');
    const exportId = await client.postCreateVideo({
      finderId: client.getFinderId(),
      shortTitle,
      description,
      topics: tags,
      video,
      cover,
      clipKey,
      traceKey,
      uploadCdnStart: uploadStarted,
      uploadCdnEnd: Math.max(uploadEnded, uploadStarted),
      uploadCostMs,
    });
    // 已拿到 exportId 后再标 submitted，便于 create 失败时允许重试
    submitted = true;
    // post_create 结果为公开；仅自己可见须再调 post_update_visible
    if (visibility === 'private') {
      await client.updateVisible(exportId, CHANNELS_VISIBLE_PRIVATE);
    }

    try {
      onProgress({ ...base, phase: 'done', message: '视频已提交' });
    } catch {
      // 进度回调失败不影响已确认回执
    }
    return {
      ...base,
      ok: true,
      platformPostId: exportId,
      platformUrl: 'https://channels.weixin.qq.com/platform/post/list',
    };
  } catch (error) {
    const known = error instanceof ArticleApiError;
    return {
      ...base,
      ok: false,
      errorCode: known
        ? error.code
        : submitted
          ? 'PUBLISH_RESULT_UNKNOWN'
          : 'PUBLISH_FAILED',
      error: known
        ? error.message
        : submitted
          ? '尚未确认发布结果，请先到平台查看'
          : '视频发布未成功，请稍后重试',
    };
  }
}
