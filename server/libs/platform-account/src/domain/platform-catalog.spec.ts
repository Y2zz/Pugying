import { PLATFORM_CATALOG, getPlatformCatalogItem, isPlatformId, type PlatformId } from './platform-catalog';

describe('platform-catalog', () => {
  it('contains the five supported platforms', () => {
    expect(PLATFORM_CATALOG.map((item) => item.id)).toEqual(['douyin', 'toutiao', 'channels', 'bilibili', 'xiaohongshu']);
  });

  it('has unique ids and https login urls', () => {
    const ids = PLATFORM_CATALOG.map((item) => item.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const item of PLATFORM_CATALOG) {
      expect(item.loginUrl).toMatch(/^https:\/\//);
      expect(item.displayName.length).toBeGreaterThan(0);
    }
  });

  describe('isPlatformId', () => {
    it('accepts every catalog id', () => {
      for (const item of PLATFORM_CATALOG) {
        expect(isPlatformId(item.id)).toBe(true);
      }
    });

    it('rejects unknown values', () => {
      expect(isPlatformId('weibo')).toBe(false);
      expect(isPlatformId('')).toBe(false);
      expect(isPlatformId('DOUYIN')).toBe(false);
    });
  });

  describe('getPlatformCatalogItem', () => {
    it('returns the catalog entry by id', () => {
      const item = getPlatformCatalogItem('douyin');

      expect(item).toEqual({
        id: 'douyin',
        displayName: '抖音',
        loginUrl: 'https://creator.douyin.com/',
      });
    });

    it('returns undefined for unknown ids', () => {
      expect(getPlatformCatalogItem('weibo' as unknown as PlatformId)).toBeUndefined();
    });
  });
});
