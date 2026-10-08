import { randomInt } from 'node:crypto';
import { articleSettingsForPlatform } from '../../../shared/article-settings';
import { normalizeBoundPlatformResourceRef } from '../../../shared/platform-resource';
import {
  ArticleApiError,
  articlePostId,
  articleRecord,
  assertArticleResponse,
  runArticleApiPublish,
  type ArticlePublishOptions,
} from './article-api';
import {
  articleSchedule,
  articleText,
  bilibiliArticleParagraphs,
  uploadArticleImages,
  uploadedImage,
} from './article-content';

export function runBilibiliArticlePublish(options: ArticlePublishOptions) {
  return runArticleApiPublish('bilibili', options, async (api, emit) => {
    const { payload, article, signal } = options;
    const anthology = normalizeBoundPlatformResourceRef(payload.anthologyRef);
    const settings = articleSettingsForPlatform(
      payload.articleSettings,
      'bilibili',
    );
    const title = payload.title.trim();
    const visibility = payload.visibility || 'public';
    if (
      !['public', 'private'].includes(visibility) ||
      (settings.customCover && !payload.coverPath)
    ) {
      throw new ArticleApiError('invalid_payload', '请检查可见范围和文章封面');
    }
    const timing = articleSchedule(payload.scheduledAt);
    const init = await api.request(
      '/x/dynamic/feed/create/opus_init_check?editor_version=eva3-4.0.0',
    );
    assertArticleResponse(init, 'bilibili');
    const data = articleRecord(init.data);
    const verify = articleRecord(data.verify);
    if (articleRecord(verify.post_count_exceeded).result === 1) {
      throw new ArticleApiError(
        'ARTICLE_PUBLISH_LIMIT_REACHED',
        '今日投稿次数已用完，请额度恢复后重试',
      );
    }
    if (articleRecord(verify.editor_version_unqualified).result === 1) {
      throw new ArticleApiError(
        'ARTICLE_API_CHANGED',
        '请更新应用后再发布文章',
      );
    }
    // 新建文章只检查投稿限制；edit_count_exceeded 仅限制修改已有文章。
    if (
      ['banned', 'level_unsufficient', 'unreal_name', 'unbind_phone'].some(
        (key) => articleRecord(verify[key]).result === 1,
      )
    ) {
      throw new ArticleApiError(
        'ARTICLE_SETTINGS_UNAVAILABLE',
        '该账号暂时不能发布文章，请到创作者中心查看要求',
      );
    }
    const config = articleRecord(data.config);
    const length = articleText(article.nodes).length;
    if (
      !title ||
      title.length > Number(config.max_title_len || 40) ||
      title.length < Number(config.min_title_len || 1) ||
      !length ||
      length > Number(config.max_article_len || 100000) ||
      article.imagePaths.length > Number(config.max_image_count || 100)
    ) {
      throw new ArticleApiError(
        'invalid_payload',
        '请检查文章标题、正文长度和图片数量',
      );
    }
    const nav = await api.request('/x/web-interface/nav');
    assertArticleResponse(nav, 'bilibili');
    const user = articleRecord(nav.data);
    if (user.isLogin !== true || !user.mid) {
      throw new ArticleApiError('AUTH_EXPIRED', '账号登录已失效，请重新授权');
    }
    emit('uploading', '上传文章图片与封面');
    const images = await uploadArticleImages(
      api,
      [
        ...article.imagePaths,
        ...(settings.customCover ? [payload.coverPath] : []),
      ],
      signal,
    );
    const articleInfo: Record<string, unknown> = {
      category_id: 15,
      // 未选文集时与官方新建默认一致：list_id=0
      list_id: anthology ? Number(anthology.id) : 0,
      originality: settings.original ? 1 : 0,
      reproduced: settings.original ? 0 : 1,
    };
    if (anthology && !Number.isSafeInteger(articleInfo.list_id)) {
      throw new ArticleApiError('invalid_payload', '请重新选择文集');
    }
    if (settings.customCover) {
      const image = uploadedImage(images, payload.coverPath);
      articleInfo.cover = [
        {
          url: image.url,
          width: image.width,
          height: image.height,
          size: image.size,
        },
      ];
    }
    const body = {
      raw_content: '',
      opus_req: {
        upload_id: `${user.mid}_${Math.floor(Date.now() / 1000)}_${randomInt(10000)}`,
        opus: {
          opus_source: 2,
          title,
          content: { paragraphs: bilibiliArticleParagraphs(article, images) },
          article: articleInfo,
          pub_info: {
            editor_version: 'eva3-4.0.0',
            ...(timing ? { timer_pub_time: timing } : {}),
          },
        },
        scene: 12,
        meta: { app_meta: { from: 'create.creative.h5', mobi_app: 'web' } },
        option: {
          aigc: payload.authorDeclaration === 'ai_generated' ? 1 : 2,
          close_comment: settings.comments === 'closed' ? 1 : 0,
          up_choose_comment: settings.comments === 'selected' ? 1 : 0,
          private_pub: visibility === 'private' ? 1 : 2,
          ...(timing ? { timer_pub_time: timing } : {}),
        },
      },
    };
    emit('submitting', '提交文章');
    const result = await api.request('/x/dynamic/feed/create/opus', body);
    assertArticleResponse(result, 'bilibili', true);
    const platformPostId = articlePostId(articleRecord(result.data).dyn_id_str);
    return {
      platformPostId,
      platformUrl: `https://www.bilibili.com/opus/${platformPostId}`,
    };
  });
}
