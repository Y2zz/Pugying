export type PlatformId = 'douyin' | 'toutiao' | 'channels' | 'bilibili' | 'xiaohongshu';

export type PlatformAccountStatus = 'active' | 'expired' | 'revoked';

export interface PlatformCatalogItem {
  id: PlatformId;
  displayName: string;
  /** 授权窗入口（未登录时的扫码/登录页） */
  loginUrl: string;
  /**
   * 创作者中心入口。缺省等同 loginUrl。
   * 视频号 login.html 即便已有会话也会停在扫码页，打开必须用后台首页。
   */
  homeUrl?: string;
}

export const PLATFORM_CATALOG: PlatformCatalogItem[] = [
  {
    id: 'douyin',
    displayName: '抖音',
    loginUrl: 'https://creator.douyin.com/',
  },
  {
    id: 'toutiao',
    displayName: '今日头条',
    loginUrl: 'https://mp.toutiao.com/',
  },
  {
    id: 'channels',
    displayName: '视频号',
    loginUrl: 'https://channels.weixin.qq.com/login.html',
    homeUrl: 'https://channels.weixin.qq.com/platform',
  },
  {
    id: 'bilibili',
    displayName: '哔哩哔哩',
    loginUrl: 'https://member.bilibili.com/',
  },
  {
    id: 'xiaohongshu',
    displayName: '小红书',
    loginUrl: 'https://creator.xiaohongshu.com/',
  },
];

export function isPlatformId(value: string): value is PlatformId {
  return PLATFORM_CATALOG.some((item) => item.id === value);
}

export function getPlatformCatalogItem(
  id: PlatformId,
): PlatformCatalogItem | undefined {
  return PLATFORM_CATALOG.find((item) => item.id === id);
}
