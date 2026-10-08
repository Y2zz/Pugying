import {
  composeDouyinGraphicDescription,
  isDouyinAuthorDeclaration,
  type DouyinAuthorDeclaration,
} from '../../../shared/douyin-graphic-settings';
import type { PlatformResourceRef } from '../../../shared/platform-resource';
import type {
  PlatformPublishProgressPayload,
  PlatformPublishResultPayload,
  PlatformPublishStartPayload,
} from '../publish-protocol';
import {
  ArticleApiError,
  articlePostId,
  assertArticleActive,
  assertArticleResponse,
} from './article-api';
import { articleSchedule } from './article-content';
import type { CookiePublishSessionOptions } from './article-api-session';
import {
  douyinTopicNames,
  resolveDouyinTopics,
} from './douyin-topic-resolve';
import type { VideoApiSession } from './video-api';

export interface VideoPublishOptions {
  payload: PlatformPublishStartPayload;
  onProgress: (progress: PlatformPublishProgressPayload) => void;
  signal: { cancelled: boolean };
  createSession?: (
    platform: 'douyin',
    options: CookiePublishSessionOptions,
  ) => Promise<VideoApiSession>;
}

const DECLARATIONS: Record<Exclude<DouyinAuthorDeclaration, 'none'>, string> = {
  ai_generated: 'aigc',
  personal_opinion: 'personal_opinion',
  reposted: 'from_net_v3',
  marketing: 'marketing',
  fictional: 'only_fun_new',
};

/** 2026-10-07 官方视频编辑器：标题以空格连接简介，话题分别保存全文/简介偏移。 */
function videoCaption(
  title: string,
  caption: string,
  topics: PlatformResourceRef[],
) {
  const byName = new Map(topics.map((topic) => [topic.name, topic.id]));
  const extra: Record<string, unknown>[] = [];
  const challenges: string[] = [];
  for (const match of caption.matchAll(/#[^\s#]+/g)) {
    const name = match[0].slice(1);
    const hashtagId = byName.get(name) ?? '0';
    if (hashtagId !== '0') {
      challenges.push(hashtagId);
    }
    extra.push({
      start: title.length + 1 + match.index,
      end: title.length + 1 + match.index + match[0].length,
      caption_start: match.index,
      caption_end: match.index + match[0].length,
      hashtag_id: hashtagId,
      hashtag_name: name,
      type: 1,
    });
  }
  return {
    text: `${title} ${caption}`,
    caption,
    item_title: title,
    text_extra: JSON.stringify(extra),
    challenges: JSON.stringify(challenges),
    mentions: '[]',
    activity: '[]',
    hashtag_source: extra.map(() => 'search').join('/'),
  };
}

/** 真实视频上传及 create_v2 提交，无网页填表、模拟回执或自动重复提交。 */
export async function runDouyinHttpPublish(
  options: VideoPublishOptions,
): Promise<PlatformPublishResultPayload> {
  const { payload, signal, onProgress } = options;
  const base = {
    requestId: payload.requestId,
    targetId: payload.targetId,
    platform: 'douyin',
  };
  const emit = (
    phase: PlatformPublishProgressPayload['phase'],
    message: string,
  ) => {
    assertArticleActive(signal);
    onProgress({ ...base, phase, message });
  };
  let api: VideoApiSession | undefined;
  let submitted = false;
  try {
    emit('accepted', '准备发布视频');
    const title = payload.title.trim();
    const provisionalTags = [
      ...new Set(
        (payload.tags ?? [])
          .map((tag) => tag.trim().replace(/^#+/, ''))
          .filter(Boolean),
      ),
    ];
    const provisionalCaption = composeDouyinGraphicDescription(
      payload.body ?? '',
      provisionalTags,
    );
    const declaration = payload.authorDeclaration ?? 'none';
    const visibility = (
      { public: 0, private: 1, friends: 2 } as Record<string, number>
    )[payload.visibility ?? 'public'];
    if (
      payload.platform !== 'douyin' ||
      !title ||
      title.length > 30 ||
      provisionalCaption.length > 1000 ||
      !payload.mediaPath?.trim() ||
      visibility === undefined ||
      !isDouyinAuthorDeclaration(declaration) ||
      provisionalTags.length > 5 ||
      provisionalTags.some((tag) => /\s|#/.test(tag))
    ) {
      throw new ArticleApiError(
        'invalid_payload',
        '请检查视频、标题、简介和发布设置',
      );
    }
    const timing = articleSchedule(payload.scheduledAt);
    const checkSchedule = () => {
      if (
        timing !== undefined &&
        (timing * 1000 < Date.now() + 2 * 3600000 ||
          timing * 1000 > Date.now() + 14 * 86400000)
      ) {
        throw new ArticleApiError(
          'invalid_payload',
          '发布时间需在 2 小时至 14 天内',
        );
      }
    };
    checkSchedule();
    emit('opening_creator', '连接发布平台');
    const factory =
      options.createSession ??
      (await import('./article-api-session')).createArticleApiSession;
    api = await factory('douyin', options);
    const topics = await resolveDouyinTopics(api, payload);
    const tags = douyinTopicNames(topics);
    const caption = composeDouyinGraphicDescription(payload.body ?? '', tags);
    const metadata = videoCaption(title, caption, topics);
    emit('uploading', '上传视频');
    const video = await api.uploadVideo(payload.mediaPath);
    if (
      !video.vid ||
      !(
        video.duration > 0 &&
        video.duration <= 3600 &&
        video.width > 0 &&
        video.height > 0
      ) ||
      !video.coverUri
    ) {
      throw new ArticleApiError(
        'VIDEO_UNSUPPORTED',
        '未能确认视频信息，请检查视频后重试',
      );
    }
    const cover: Record<string, unknown> = {
      poster: video.coverUri,
      poster_delay: 0,
    };
    if (payload.coverPath?.trim()) {
      emit('uploading', '上传竖版封面');
      const image = await api.uploadImage(payload.coverPath);
      delete cover.poster;
      Object.assign(cover, {
        upload_poster: image.uri,
        custom_cover_image_width: image.width,
        custom_cover_image_height: image.height,
      });
    }
    if (payload.coverLandscapePath?.trim()) {
      emit('uploading', '上传横版封面');
      const image = await api.uploadImage(payload.coverLandscapePath);
      if (payload.coverPath?.trim()) {
        Object.assign(cover, {
          horizontal_custom_cover_image_uri: image.uri,
          horizontal_custom_cover_image_width: image.width,
          horizontal_custom_cover_image_height: image.height,
          horizontal_cover_tsp: 0,
        });
      } else {
        Object.assign(cover, {
          poster: image.uri,
          custom_cover_image_width: image.width,
          custom_cover_image_height: image.height,
        });
      }
    }
    checkSchedule();
    emit('submitting', '提交视频');
    submitted = true;
    const response = await api.request('/web/api/media/aweme/create_v2/', {
      item: {
        common: {
          media_type: 4,
          video_id: video.vid,
          creation_id: payload.requestId,
          ...metadata,
          visibility_type: visibility,
          download: payload.allowDownload === false ? 0 : 1,
          timing: timing ?? 0,
        },
        cover,
        assistant: { is_preview: 0, is_post_assistant: 0 },
        ...(declaration === 'none'
          ? {}
          : {
              declare: {
                user_declare_info: JSON.stringify({
                  choose_value: DECLARATIONS[declaration],
                }),
              },
            }),
      },
    });
    assertArticleResponse(response, 'douyin', true);
    const platformPostId = articlePostId(response.item_id);
    try {
      onProgress({ ...base, phase: 'done', message: '视频已提交' });
    } catch {
      // 进度窗口关闭不能丢失已经确认的作品回执。
    }
    return {
      ...base,
      ok: true,
      platformPostId,
      platformUrl: `https://www.douyin.com/video/${platformPostId}`,
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
  } finally {
    await api?.dispose().catch(() => {});
  }
}
