import { describe, expect, it } from 'vitest';
import { matchPlatformQuery } from '@/lib/platforms';
import type { PlatformCatalogItem } from '@/lib/api';

const douyin: PlatformCatalogItem = {
  id: 'douyin',
  displayName: '抖音',
  loginUrl: 'https://creator.douyin.com/',
};

const bilibili: PlatformCatalogItem = {
  id: 'bilibili',
  displayName: '哔哩哔哩',
  loginUrl: 'https://member.bilibili.com/',
};

describe('matchPlatformQuery', () => {
  it('matches empty query', () => {
    expect(matchPlatformQuery(douyin, '')).toBe(true);
    expect(matchPlatformQuery(douyin, '  ')).toBe(true);
  });

  it('matches displayName and id', () => {
    expect(matchPlatformQuery(douyin, '抖')).toBe(true);
    expect(matchPlatformQuery(douyin, 'DouYin')).toBe(true);
  });

  it('matches aliases', () => {
    expect(matchPlatformQuery(bilibili, 'B站')).toBe(true);
    expect(matchPlatformQuery(bilibili, 'bili')).toBe(true);
  });

  it('rejects unrelated query', () => {
    expect(matchPlatformQuery(douyin, '小红书')).toBe(false);
  });
});
