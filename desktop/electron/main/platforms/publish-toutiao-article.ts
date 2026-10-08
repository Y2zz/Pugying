import { articleSettingsForPlatform } from '../../../shared/article-settings';
import { normalizeBoundPlatformResourceRef } from '../../../shared/platform-resource';
import { renderArticleForPlatform } from '../article-publish-format';
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
  uploadArticleImages,
  uploadedImage,
} from './article-content';

const DECLARATIONS = {
  internet: 4,
  platform: 1,
  opinion: 5,
  ai: 3,
  fiction: 6,
  investment: 7,
  health: 8,
};
const field = (object: Record<string, unknown>, snake: string, camel: string) =>
  object[snake] ?? object[camel];

export function runToutiaoArticlePublish(options: ArticlePublishOptions) {
  return runArticleApiPublish('toutiao', options, async (api, emit) => {
    const { payload, article, signal } = options;
    const settings = articleSettingsForPlatform(
      payload.articleSettings,
      'toutiao',
    );
    const title = payload.title.trim();
    const declarations = settings.declarations ?? [];
    if (declarations.length > 1 || declarations.includes('platform')) {
      throw new ArticleApiError(
        'ARTICLE_SETTINGS_UNSUPPORTED',
        '头条仅支持一项作品声明；引用平台内容请在创作者中心选择来源账号',
      );
    }
    if (
      title.length < 2 ||
      title.length > 30 ||
      !articleText(article.nodes).trim()
    ) {
      throw new ArticleApiError('invalid_payload', '请检查文章标题和正文');
    }
    const coverPaths =
      settings.coverMode === 'none'
        ? []
        : (payload.articleCoverPaths ??
          (payload.coverPath ? [payload.coverPath] : []));
    const needed =
      settings.coverMode === 'triple'
        ? 3
        : settings.coverMode === 'none'
          ? 0
          : 1;
    if (coverPaths.length !== needed) {
      throw new ArticleApiError('invalid_payload', '请补齐文章封面');
    }
    const timing = articleSchedule(payload.scheduledAt);
    const preflight = await api.request(
      '/mp/agw/article/new?article_type=0&format=json&compat=1&column_no=',
    );
    assertArticleResponse(preflight, 'toutiao');
    if (
      settings.allowReward &&
      !(Number(preflight.__pugyingRewardRemaining) > 0)
    ) {
      throw new ArticleApiError(
        'ARTICLE_SETTINGS_UNAVAILABLE',
        '该账号暂时不能开启赞赏，请关闭后再发布',
      );
    }
    const strategy = await api.request(
      '/mp/agw/diversity/publish/strategy/v1/check/?aid=1231&genre=1&is_draft=0',
    );
    if (Number(field(strategy, 'err_no', 'errNo')) !== 0) {
      throw new ArticleApiError(
        'ARTICLE_API_CHANGED',
        '暂时无法确认账号发布设置，请稍后重试',
      );
    }
    if (
      settings.exclusive &&
      (articleText(article.nodes).trim().length < 100 ||
        !field(
          articleRecord(strategy.exclusive),
          'has_permission',
          'hasPermission',
        ))
    ) {
      throw new ArticleApiError(
        'ARTICLE_SETTINGS_UNAVAILABLE',
        '该文章暂时不能声明首发，请检查账号权益和正文长度',
      );
    }
    let syncFlag = '0';
    if (settings.syncToMicroPost) {
      const config = articleRecord(
        field(strategy, 'tuwen_wtt_transfer', 'tuwenWttTransfer'),
      );
      const textLength = articleText(article.nodes).length;
      const match = Object.values(config)
        .map(articleRecord)
        .find((range) => {
          const min = Number(range.min);
          const max = Number(range.max);
          return min <= max
            ? min <= textLength && textLength <= max
            : min <= textLength;
        });
      syncFlag = String(
        match
          ? (field(match, 'tuwen_wtt_trans_flag', 'tuwenWttTransFlag') ?? '0')
          : '0',
      );
      if (syncFlag === '0') {
        throw new ArticleApiError(
          'ARTICLE_SETTINGS_UNAVAILABLE',
          '该文章暂时不能同步微头条，请关闭后再发布',
        );
      }
    }
    emit('uploading', '上传文章图片与封面');
    const images = await uploadArticleImages(
      api,
      [...article.imagePaths, ...coverPaths],
      signal,
    );
    const urls = new Map([...images].map(([path, image]) => [path, image.url]));
    const byUrl = new Map(
      [...images.values()].map((image) => [image.url, image]),
    );
    const escape = (value: string) =>
      value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    const content = renderArticleForPlatform(article, urls, {
      acceptedTags: [
        'p',
        'h2',
        'blockquote',
        'ul',
        'ol',
        'li',
        'strong',
        'em',
        'u',
        's',
        'br',
        'a',
        'code',
        'pre',
        'hr',
      ],
      renderImage: (url, alt, caption) => {
        const image = byUrl.get(url.replace(/&amp;/g, '&'))!;
        return `<img src="${url}" alt="${alt}" web_uri="${escape(image.uri)}" img_width="${image.width}" img_height="${image.height}">${caption ? `<p>${caption}</p>` : ''}`;
      },
    });
    const extra: Record<string, unknown> = {
      content_source: 100000000402,
      tuwen_wtt_trans_flag: syncFlag,
    };
    if (declarations[0]) {
      extra.info_source = {
        source_type: DECLARATIONS[declarations[0]],
        source_author_uid: '',
        time_format: '',
        position: {},
      };
    }
    // 官方文章表单 position → extra.manual_selected_city（城市名 + 城市编码）
    const location = normalizeBoundPlatformResourceRef(payload.locationRef);
    if (location) {
      extra.manual_selected_city = JSON.stringify({
        city: location.name,
        city_code: location.id,
      });
    }
    const timerTime = timing
      ? new Intl.DateTimeFormat('sv-SE', {
          timeZone: 'Asia/Shanghai',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(new Date(timing * 1000))
      : '';
    emit('submitting', '提交文章');
    const result = await api.request(
      '/mp/agw/article/publish?source=mp&type=article&aid=1231&mp_publish_ab_val=0',
      {
        title,
        content,
        article_type: 0,
        pgc_id: '',
        source: 29,
        save: 1,
        entrance: 'main',
        timer_status: timing ? 1 : 0,
        timer_time: timerTime,
        pgc_feed_covers: JSON.stringify(
          coverPaths.map((path) => {
            const image = uploadedImage(images, path);
            return {
              id: '',
              url: image.url,
              uri: image.uri,
              thumb_width: image.width,
              thumb_height: image.height,
              origin_uri: image.uri,
              extra: { from_content: '0' },
            };
          }),
        ),
        draft_form_data: JSON.stringify({
          coverType: needed === 0 ? 1 : needed === 1 ? 2 : 3,
        }),
        article_ad_type: settings.advertisement ? 3 : 2,
        claim_exclusive: settings.exclusive ? 1 : 0,
        praise: settings.allowReward ? 1 : 0,
        disable_praise: settings.allowReward ? 0 : 1,
        extra: JSON.stringify(extra),
      },
    );
    assertArticleResponse(result, 'toutiao', true);
    const data = articleRecord(result.data);
    const platformPostId = articlePostId(data.pgc_id ?? data.pgcId);
    return {
      platformPostId,
      platformUrl: `https://www.toutiao.com/article/${platformPostId}/`,
    };
  });
}
