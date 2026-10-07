/**
 * 视频号图文发布：helper_upload_params → COS 分片上传 → post_create（mediaType=2）。
 * 仅自己可见：创建后调 post_update_visible（visibleType=3）；定时尚未对齐。
 */
import type {
  PlatformPublishProgressPayload,
  PlatformPublishResultPayload,
} from '../publish-protocol';
import { ArticleApiError, assertArticleActive } from './article-api';
import {
  CHANNELS_VISIBLE_PRIVATE,
  ChannelsGraphicClient,
  type ChannelsHttpTransport,
} from './channels-graphic-client';
import type { PlatformGraphicPublishOptions } from './publish-graphic';

const MAX_IMAGES = 18;
const MAX_DESC = 1000;
const MAX_TITLE = 30;
const MAX_TAGS = 10;

export interface ChannelsGraphicPublishOptions
  extends PlatformGraphicPublishOptions {
  createClient?: (options: {
    cookies: PlatformGraphicPublishOptions['payload']['cookies'];
    transport?: ChannelsHttpTransport;
  }) => ChannelsGraphicClient;
  transport?: ChannelsHttpTransport;
}

/** 标题、正文、话题拼成视频号描述；话题以 # 追加。 */
export function channelsGraphicDescription(
  title: string,
  body: string,
  tags: string[],
): string {
  const parts = [title.trim(), body.trim()].filter(Boolean);
  const text = parts.join('\n');
  const topicSuffix = tags
    .map((tag) => tag.trim().replace(/^#+/, ''))
    .filter(Boolean)
    .map((tag) => `#${tag}`)
    .join(' ');
  return [text, topicSuffix].filter(Boolean).join(text && topicSuffix ? ' ' : '');
}

export async function runChannelsGraphicPublish(
  options: ChannelsGraphicPublishOptions,
): Promise<PlatformPublishResultPayload> {
  const { payload, signal, onProgress } = options;
  const base = {
    requestId: payload.requestId,
    targetId: payload.targetId,
    platform: 'channels',
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
    emit('accepted', '准备发布图文');
    const title = payload.title.trim();
    const body = payload.body?.trim() ?? '';
    const paths = (
      payload.mediaPaths ?? (payload.mediaPath ? [payload.mediaPath] : [])
    )
      .map((path) => path.trim())
      .filter(Boolean);
    const tags = [
      ...new Set(
        (payload.tags ?? [])
          .map((tag) => tag.trim().replace(/^#+/, ''))
          .filter(Boolean),
      ),
    ];
    const description = channelsGraphicDescription(title, body, tags);
    // 测试与日常试发默认仅自己可见，避免误公开
    const visibility = payload.visibility ?? 'private';

    if (
      payload.platform !== 'channels' ||
      title.length > MAX_TITLE ||
      !body ||
      description.length > MAX_DESC ||
      paths.length < 1 ||
      paths.length > MAX_IMAGES ||
      tags.length > MAX_TAGS ||
      tags.some((tag) => /\s|#/.test(tag)) ||
      !['public', 'private'].includes(visibility) ||
      payload.scheduledAt ||
      (payload.authorDeclaration && payload.authorDeclaration !== 'none')
    ) {
      throw new ArticleApiError(
        'invalid_payload',
        '请检查图文内容和发布设置',
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

    emit('uploading', '上传图文图片');
    const uploadStarted = Math.floor(Date.now() / 1000);
    const images = [];
    for (const path of paths) {
      assertArticleActive(signal);
      images.push(await client.uploadImage(path));
    }
    const uploadEnded = Math.floor(Date.now() / 1000);
    const traceKey = await client.getTraceKey();
    assertArticleActive(signal);

    emit('submitting', '提交图文');
    submitted = true;
    const exportId = await client.postCreate({
      finderId: client.getFinderId(),
      description,
      images,
      topics: tags,
      traceKey,
      uploadCdnStart: uploadStarted,
      uploadCdnEnd: Math.max(uploadEnded, uploadStarted),
    });
    // post_create 结果为公开；仅自己可见须再调 post_update_visible（objectId=exportId）
    if (visibility === 'private') {
      await client.updateVisible(exportId, CHANNELS_VISIBLE_PRIVATE);
    }

    try {
      onProgress({ ...base, phase: 'done', message: '图文已提交' });
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
          : '图文发布未成功，请稍后重试',
    };
  }
}
