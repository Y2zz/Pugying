import type { ArticlePlatformAccountFormProps } from "../../publish-article/account-forms/shared-fields";
import { ToutiaoGraphicAccountForm } from "./ToutiaoGraphicAccountForm";
import { ChannelsGraphicAccountForm } from "./ChannelsGraphicAccountForm";
import { DouyinGraphicAccountForm } from "./DouyinGraphicAccountForm";
import { XiaohongshuGraphicAccountForm } from "./XiaohongshuGraphicAccountForm";

/** 图文分发：抖音图文 / 小红书 / 视频号 */
export function GraphicPlatformAccountForm(
  props: ArticlePlatformAccountFormProps,
) {
  switch (props.account.platform) {
    case "douyin":
      return <DouyinGraphicAccountForm {...props} />;
    case "toutiao":
      return <ToutiaoGraphicAccountForm {...props} />;
    case "channels":
      return <ChannelsGraphicAccountForm {...props} />;
    case "xiaohongshu":
      return <XiaohongshuGraphicAccountForm {...props} />;
    default:
      return null;
  }
}

export type { ArticlePlatformAccountFormProps as GraphicPlatformAccountFormProps };
