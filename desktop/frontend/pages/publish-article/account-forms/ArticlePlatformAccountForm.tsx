import type { ArticlePlatformAccountFormProps } from './shared-fields';
import { BilibiliArticleAccountForm } from './BilibiliArticleAccountForm';
import { DouyinArticleAccountForm } from './DouyinArticleAccountForm';
import { ToutiaoArticleAccountForm } from './ToutiaoArticleAccountForm';

/**
 * 按账号所属平台路由到文章表单（头条 / B 站 / 抖音发文章）。
 * 图文平台表单在 publish-graphic。
 */
export function ArticlePlatformAccountForm(props: ArticlePlatformAccountFormProps) {
  switch (props.account.platform) {
    case 'douyin':
      return <DouyinArticleAccountForm {...props} />;
    case 'toutiao':
      return <ToutiaoArticleAccountForm {...props} />;
    case 'bilibili':
      return <BilibiliArticleAccountForm {...props} />;
    default:
      return null;
  }
}

export type { ArticlePlatformAccountFormProps } from './shared-fields';
