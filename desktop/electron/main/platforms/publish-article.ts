import { ArticleApiError, type ArticlePublishOptions } from './article-api';
import { runDouyinArticlePublish } from './publish-douyin-article';
import { runToutiaoArticlePublish } from './publish-toutiao-article';
import { runBilibiliArticlePublish } from './publish-bilibili-article';

export function runPlatformArticlePublish(options: ArticlePublishOptions) {
  switch (options.payload.platform) {
    case 'douyin':
      return runDouyinArticlePublish(options);
    case 'toutiao':
      return runToutiaoArticlePublish(options);
    case 'bilibili':
      return runBilibiliArticlePublish(options);
    default:
      throw new ArticleApiError(
        'unsupported_platform',
        '该平台暂不支持文章发布',
      );
  }
}
