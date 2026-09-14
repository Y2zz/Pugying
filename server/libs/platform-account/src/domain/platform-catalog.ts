export type PlatformId = 'douyin' | 'toutiao' | 'channels' | 'bilibili' | 'xiaohongshu';

export type PlatformAccountStatus = 'active' | 'expired' | 'revoked';

export interface PlatformCatalogItem {
  id: PlatformId;
  displayName: string;
  loginUrl: string;
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
    loginUrl: 'https://channels.weixin.qq.com/',
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
