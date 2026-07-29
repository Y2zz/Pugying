import type { PlatformCatalogItem, PlatformId } from '@/lib/api';

/** Extra tokens for fuzzy platform search beyond id / displayName. */
const PLATFORM_SEARCH_ALIASES: Record<PlatformId, string[]> = {
  douyin: ['抖音', 'dy', '抖'],
  toutiao: ['头条', '今日头条', 'tt'],
  channels: ['视频号', '微信视频号', '微信', 'weixin', 'wechat'],
  bilibili: ['哔哩哔哩', 'b站', 'bili'],
  xiaohongshu: ['小红书', 'xhs', '红书', '小红'],
};

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
