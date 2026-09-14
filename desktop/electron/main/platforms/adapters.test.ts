import {
  getPlatformAdapter,
  PLATFORM_ADAPTERS,
  type CookieLike,
} from './adapters';

function cookies(...names: string[]): CookieLike[] {
  return names.map((name) => ({ name, value: 'x' }));
}

describe('getPlatformAdapter', () => {
  it('resolves every declared platform id', () => {
    for (const id of [
      'douyin',
      'toutiao',
      'channels',
      'bilibili',
      'xiaohongshu',
    ]) {
      const adapter = getPlatformAdapter(id);
      expect(adapter).toBeDefined();
      expect(adapter?.id).toBe(id);
    }
  });

  it('returns undefined for unknown platforms', () => {
    expect(getPlatformAdapter('weibo')).toBeUndefined();
    expect(getPlatformAdapter('')).toBeUndefined();
    expect(getPlatformAdapter('DOUYIN')).toBeUndefined();
  });
});

describe('adapter metadata', () => {
  it('declares an https login URL and cookie domains everywhere', () => {
    for (const adapter of Object.values(PLATFORM_ADAPTERS)) {
      expect(adapter.loginUrl).toMatch(/^https:\/\//);
      expect(adapter.cookieDomains.length).toBeGreaterThan(0);
      expect(adapter.displayName.length).toBeGreaterThan(0);
    }
  });

  it('keeps every declared profile source on https', () => {
    for (const adapter of Object.values(PLATFORM_ADAPTERS)) {
      for (const source of adapter.profileSources ?? []) {
        expect(source.url).toMatch(/^https:\/\//);
      }
    }
  });
});

describe('isAuthed: douyin', () => {
  const adapter = PLATFORM_ADAPTERS.douyin;

  it('accepts a session cookie on the creator domain', () => {
    expect(
      adapter.isAuthed(cookies('sessionid'), 'https://creator.douyin.com/home'),
    ).toBe(true);
  });

  it('rejects login pages even with cookies', () => {
    expect(
      adapter.isAuthed(cookies('sessionid'), 'https://creator.douyin.com/login'),
    ).toBe(false);
  });

  it('rejects the creator domain without a session cookie', () => {
    expect(
      adapter.isAuthed(cookies('ttwid'), 'https://creator.douyin.com/home'),
    ).toBe(false);
  });

  it('rejects other domains outright', () => {
    expect(
      adapter.isAuthed(cookies('sessionid'), 'https://www.douyin.com/'),
    ).toBe(false);
  });
});

describe('isAuthed: toutiao', () => {
  const adapter = PLATFORM_ADAPTERS.toutiao;

  it('accepts sid_tt on mp.toutiao.com', () => {
    expect(
      adapter.isAuthed(cookies('sid_tt'), 'https://mp.toutiao.com/profile'),
    ).toBe(true);
  });

  it('rejects without session cookies', () => {
    expect(adapter.isAuthed([], 'https://mp.toutiao.com/profile')).toBe(false);
  });
});

describe('isAuthed: channels', () => {
  const adapter = PLATFORM_ADAPTERS.channels;

  it('accepts wxuin on channels.weixin.qq.com', () => {
    expect(
      adapter.isAuthed(
        cookies('wxuin'),
        'https://channels.weixin.qq.com/platform',
      ),
    ).toBe(true);
  });

  it('rejects the login route', () => {
    expect(
      adapter.isAuthed(
        cookies('wxuin'),
        'https://channels.weixin.qq.com/login',
      ),
    ).toBe(false);
  });
});

describe('isAuthed: bilibili', () => {
  const adapter = PLATFORM_ADAPTERS.bilibili;

  it('accepts SESSDATA on member.bilibili.com', () => {
    expect(
      adapter.isAuthed(
        cookies('SESSDATA'),
        'https://member.bilibili.com/platform/home',
      ),
    ).toBe(true);
  });

  it('accepts the studio domain too', () => {
    expect(
      adapter.isAuthed(cookies('bili_jct'), 'https://studio.bilibili.com/'),
    ).toBe(true);
  });

  it('declares DedeUserID as the user-id cookie', () => {
    expect(adapter.userIdCookie).toBe('DedeUserID');
  });
});

describe('isAuthed: xiaohongshu', () => {
  const adapter = PLATFORM_ADAPTERS.xiaohongshu;

  it('accepts web_session on creator.xiaohongshu.com', () => {
    expect(
      adapter.isAuthed(
        cookies('web_session'),
        'https://creator.xiaohongshu.com/new/home',
      ),
    ).toBe(true);
  });

  it('rejects the consumer site', () => {
    expect(
      adapter.isAuthed(cookies('web_session'), 'https://www.xiaohongshu.com/'),
    ).toBe(false);
  });
});
