import { articleSettingsForPlatform } from '../../../shared/article-settings';
import {
  ArticleApiError,
  articlePostId,
  assertArticleResponse,
  runArticleApiPublish,
  type ArticlePublishOptions,
} from './article-api';
import {
  articleSchedule,
  articleText,
  douyinArticleMarkdown,
  uploadArticleImages,
  uploadedImage,
} from './article-content';

export function runDouyinArticlePublish(options: ArticlePublishOptions) {
  return runArticleApiPublish('douyin', options, async (api, emit) => {
    const { payload, article, signal } = options;
    const title = payload.title.trim();
    const settings = articleSettingsForPlatform(
      payload.articleSettings,
      'douyin',
    );
    const length = articleText(article.nodes).trim().length;
    if (
      title.length > 30 ||
      (settings.summary?.length ?? 0) > 30 ||
      length < 100 ||
      length > 20000
    ) {
      throw new ArticleApiError(
        'invalid_payload',
        '抖音文章正文需为 100～20,000 字，标题和摘要最多 30 字',
      );
    }
    const tags = [
      ...new Set(
        (payload.tags ?? [])
          .map((tag) => tag.trim().replace(/^#+/, ''))
          .filter(Boolean),
      ),
    ];
    if (
      tags.length > 5 ||
      tags.some((tag) => /\s|#/.test(tag)) ||
      article.imagePaths.length > 30
    ) {
      throw new ArticleApiError('invalid_payload', '请检查文章话题和图片数量');
    }
    const visibility = (
      { public: 0, private: 1, friends: 2 } as Record<string, number>
    )[payload.visibility || 'public'];
    if (visibility === undefined || !payload.coverPath) {
      throw new ArticleApiError('invalid_payload', '请选择可见范围和文章封面');
    }
    const timing = articleSchedule(payload.scheduledAt);
    emit('uploading', '上传文章图片与封面');
    const images = await uploadArticleImages(
      api,
      [...article.imagePaths, payload.coverPath],
      signal,
    );
    const cover = uploadedImage(images, payload.coverPath);
    let start = Array.from(title).length + 1;
    let captionStart = 0;
    const textExtra = tags.length
      ? [
          {
            start: 0,
            end: start - 1,
            hashtag_id: 0,
            hashtag_name: '',
            type: 7,
          },
          ...tags.map((tag) => {
            const size = Array.from(tag).length + 1;
            const entry = {
              start,
              end: start + size,
              caption_start: captionStart,
              caption_end: captionStart + size,
              hashtag_id: 0,
              hashtag_name: tag,
              type: 1,
            };
            start += size + 1;
            captionStart += size + 1;
            return entry;
          }),
        ]
      : [];
    emit('submitting', '提交文章');
    const result = await api.request('/web/api/media/aweme/create_v2/', {
      item: {
        common: {
          media_type: 43,
          long_article_version: '1',
          creation_id: payload.requestId,
          text: [title, ...tags.map((tag) => `#${tag}`)].join(' '),
          text_extra: JSON.stringify(textExtra),
          description: settings.summary || '',
          visibility_type: visibility,
          timing: timing ?? -1,
          long_article: douyinArticleMarkdown(article, images),
          long_article_image_info: article.imagePaths.map((path) => {
            const image = uploadedImage(images, path);
            return {
              key: image.uri,
              value: {
                url: image.url,
                width: image.width,
                height: image.height,
              },
            };
          }),
        },
        cover: {
          poster: cover.uri,
          custom_cover_image_width: cover.width,
          custom_cover_image_height: cover.height,
        },
      },
    });
    assertArticleResponse(result, 'douyin', true);
    const platformPostId = articlePostId(result.item_id);
    return {
      platformPostId,
      platformUrl: `https://www.douyin.com/note/${platformPostId}`,
    };
  });
}
