import type { ArticlePlatformAccountFormProps } from "../../publish-article/account-forms/shared-fields";
import { ChannelsGraphicAccountForm } from "./ChannelsGraphicAccountForm";
import { ToutiaoGraphicAccountForm } from "./ToutiaoGraphicAccountForm";
import { DouyinGraphicAccountForm } from "./DouyinGraphicAccountForm";
import { XiaohongshuGraphicAccountForm } from "./XiaohongshuGraphicAccountForm";

/** 图文分发：抖音 / 头条 / 小红书 / 视频号 */
export function GraphicPlatformAccountForm(
  props: ArticlePlatformAccountFormProps,
) {
  switch (props.account.platform) {
    case "douyin":
      return <DouyinGraphicAccountForm {...props} />;
    case "toutiao":
      return <ToutiaoGraphicAccountForm {...props} />;
    case "xiaohongshu":
      return <XiaohongshuGraphicAccountForm {...props} />;
    case "channels":
      return <ChannelsGraphicAccountForm {...props} />;
    default:
      return null;
  }
}

export type { ArticlePlatformAccountFormProps as GraphicPlatformAccountFormProps };
