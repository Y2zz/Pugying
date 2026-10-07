import type {
  PlatformPublishProgressPayload,
  PlatformPublishResultPayload,
  PlatformPublishStartPayload,
} from '../publish-protocol';
import {
  ArticleApiError,
  articlePostId,
  articleRecord,
  assertArticleActive,
  assertArticleResponse,
  type ArticleApiSession,
} from './article-api';
import type {
  CookiePublishPlatform,
  CookiePublishSessionOptions,
} from './article-api-session';

export interface PlatformGraphicPublishOptions {
  payload: PlatformPublishStartPayload;
  onProgress: (progress: PlatformPublishProgressPayload) => void;
  signal: { cancelled: boolean };
  createSession?: (
    platform: CookiePublishPlatform,
    options: CookiePublishSessionOptions,
  ) => Promise<ArticleApiSession>;
}

/** 微头条没有独立标题，标题作为文案首行保留。 */
export function toutiaoGraphicText(title: string, body: string): string {
  return [title.trim(), body.trim()].filter(Boolean).join('\n\n');
}

export async function runPlatformGraphicPublish(
  options: PlatformGraphicPublishOptions,
): Promise<PlatformPublishResultPayload> {
  const { payload, signal, onProgress } = options;
  if (payload.platform === 'douyin') {
    const { runDouyinGraphicPublish } =
      await import('./publish-douyin-graphic');
    return runDouyinGraphicPublish(options);
  }
  if (payload.platform === 'channels') {
    const { runChannelsGraphicPublish } =
      await import('./publish-channels-graphic');
    return runChannelsGraphicPublish(options);
  }
  const platform = payload.platform;
  const base = {
    requestId: payload.requestId,
    targetId: payload.targetId,
    platform,
  };
  if (platform !== 'toutiao' && platform !== 'xiaohongshu') {
    return {
      ...base,
      ok: false,
      errorCode: 'unsupported_platform',
      error: '该平台暂不支持图文发布',
    };
  }
  let api: ArticleApiSession | undefined;
  let submitted = false;
  const emit = (
    phase: PlatformPublishProgressPayload['phase'],
    message: string,
  ) => {
    assertArticleActive(signal);
    onProgress({ ...base, phase, message });
  };
  try {
    emit('accepted', '准备发布图文');
    const title = payload.title.trim();
    const body = payload.body?.trim() ?? '';
    const paths = (
      payload.mediaPaths ?? (payload.mediaPath ? [payload.mediaPath] : [])
    ).map((path) => path.trim());
    const isToutiao = platform === 'toutiao';
    const maxImages = 18;
    const visibility = payload.visibility ?? 'public';
    const text = isToutiao ? toutiaoGraphicText(title, body) : body;
    if (
      !title ||
      title.length > (isToutiao ? 100 : 20) ||
      !body ||
      text.length > (isToutiao ? 2000 : 1000) ||
      paths.length < 1 ||
      paths.length > maxImages ||
      paths.some((path) => !path) ||
      !['public', ...(isToutiao ? [] : ['private'])].includes(visibility) ||
      (isToutiao && payload.scheduledAt) ||
      (payload.tags?.length ?? 0) > 0
    ) {
      throw new ArticleApiError('invalid_payload', '请检查图文内容和发布设置');
    }
    const declaration = payload.authorDeclaration ?? 'none';
    const declarations: Record<string, number> = {
      none: 0,
      fictional: 1,
      ai_generated: 2,
      marketing: 3,
      reposted: 5,
    };
    if (
      (!isToutiao && !(declaration in declarations)) ||
      (isToutiao &&
        ![
          'none',
          'ai_generated',
          'personal_opinion',
          'reposted',
          'fictional',
        ].includes(declaration))
    ) {
      throw new ArticleApiError(
        'invalid_payload',
        '该平台不支持此声明，请重新选择',
      );
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
      throw new ArticleApiError('invalid_payload', '请重新设置发布时间');
    }
    emit('opening_creator', '连接发布平台');
    const factory =
      options.createSession ??
      (await import('./article-api-session')).createArticleApiSession;
    api = await factory(platform, options);
    const images = [];
    // 每个槽位对应一个上传结果；即使同一路径出现多次，也保留用户的槽位顺序。
    for (const path of paths) {
      emit('uploading', `上传图片 ${images.length + 1}/${paths.length}`);
      images.push(await api.uploadImage(path));
    }
    const data = isToutiao
      ? {
          content: text,
          image_list: images.map((image) => image.uri),
          pre_upload: 1,
          entrance: 'main',
          extra: JSON.stringify({
            info_source: JSON.stringify({
              source_type: (
                {
                  none: -1,
                  ai_generated: 3,
                  personal_opinion: 5,
                  reposted: 4,
                  fictional: 6,
                } as Record<string, number>
              )[declaration],
              source_author_uid: '',
            }),
          }),
        }
      : {
          common: {
            type: 'normal',
            note_id: '',
            source: JSON.stringify({ type: 'web', ids: '' }),
            title,
            desc: body,
            ats: [],
            hash_tag: [],
            privacy_info: {
              op_type: 1,
              type: visibility === 'private' ? 1 : 0,
              user_ids: [],
            },
            business_binds: JSON.stringify({
              version: 1,
              bizType: time ? 13 : 0,
              notePostTiming: {
                postTime: time,
              },
              userDeclarationBind: { origin: declarations[declaration] },
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
    emit('submitting', '提交图文');
    submitted = true;
    const response = await api.request(
      isToutiao
        ? '/mp/agw/article/wtt?aid=1231&mp_publish_ab_val=0'
        : '/web_api/sns/v2/note',
      data,
    );
    let platformPostId: string;
    if (isToutiao) {
      assertArticleResponse(response, 'toutiao', true);
      const receipt = articleRecord(response.data);
      platformPostId = articlePostId(receipt.threadId ?? receipt.thread_id);
    } else {
      // 官方 HTTP 客户端对未提供 code 的成功回执补入 "N/A"。
      if (
        (response.code !== 0 && response.code !== 'N/A') ||
        response.success !== true
      ) {
        if (response.code === -100 || response.code === -10001) {
          throw new ArticleApiError(
            'AUTH_EXPIRED',
            '账号登录已失效，请重新授权',
          );
        }
        if (typeof response.code !== 'number' || response.code === 0) {
          throw new ArticleApiError(
            'PUBLISH_RESULT_UNKNOWN',
            '尚未确认发布结果，请先到平台查看',
          );
        }
        throw new ArticleApiError(
          'PLATFORM_REJECTED',
          '平台未接受本次发布，请到创作者中心查看账号或内容要求',
        );
      }
      const id = articleRecord(response.data).id;
      if (typeof id !== 'string' || !/^[a-f0-9]{24}$/.test(id)) {
        throw new ArticleApiError(
          'PUBLISH_RESULT_UNKNOWN',
          '尚未确认发布结果，请先到平台查看',
        );
      }
      platformPostId = id;
    }
    try {
      onProgress({ ...base, phase: 'done', message: '图文已提交' });
    } catch {
      // 回执已确认，进度接收失败不改变发布结果。
    }
    return {
      ...base,
      ok: true,
      platformPostId,
      platformUrl: isToutiao
        ? `https://www.toutiao.com/w/${platformPostId}/`
        : `https://www.xiaohongshu.com/explore/${platformPostId}`,
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
  } finally {
    await api?.dispose().catch(() => {});
  }
}
