import type { PlatformCatalogItem, PlatformId } from '@/lib/api';

/** Extra tokens for fuzzy platform search beyond id / displayName. */
const PLATFORM_SEARCH_ALIASES: Record<PlatformId, string[]> = {
  douyin: ['抖音', 'dy', '抖'],
  toutiao: ['头条', '今日头条', 'tt'],
  channels: ['视频号', '微信视频号', '微信', 'weixin', 'wechat'],
  bilibili: ['哔哩哔哩', 'b站', 'bili'],
  xiaohongshu: ['小红书', 'xhs', '红书', '小红'],
};

/** 文章：富文本内嵌图（头条 / B 站专栏 / 抖音发文章） */
export const ARTICLE_SUPPORTED_PLATFORMS = [
  'toutiao',
  'bilibili',
  'douyin',
] as const satisfies readonly PlatformId[];

/** 图文：多图 + 文案分离（抖音图文 / 小红书 / 视频号） */
export const GRAPHIC_SUPPORTED_PLATFORMS = [
  'douyin',
  'xiaohongshu',
  'channels',
] as const satisfies readonly PlatformId[];

export function matchPlatformQuery(item: PlatformCatalogItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  if (item.displayName.toLowerCase().includes(q) || item.id.toLowerCase().includes(q)) {
    return true;
  }
  return PLATFORM_SEARCH_ALIASES[item.id].some((alias) => alias.toLowerCase().includes(q));
}
