export type PlatformId = 'douyin' | 'toutiao' | 'channels' | 'bilibili' | 'xiaohongshu';

export interface CookieLike {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expirationDate?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}

/** Account profile scraped from the platform after a successful login. */
export interface PlatformProfile {
  /** Platform-side user id — the dedupe key for rebinding the same account */
  platformUserId?: string;
  nickname?: string;
  avatarUrl?: string;
}

/**
 * One candidate profile endpoint. These are undocumented internal APIs and
 * their response shapes drift, so each field lists several candidate paths
 * and the first non-empty one wins. A source that yields nothing is skipped
 * and the next one is tried.
 */
export interface ProfileSource {
  url: string;
  method?: 'GET' | 'POST';
  /** JSON request body for POST sources */
  body?: unknown;
  /** Dotted paths into the response, e.g. 'data.user.nickname', 'a.b[0]' */
  idPaths: string[];
  nicknamePaths: string[];
  avatarPaths: string[];
}

/** Last-resort DOM scrape against the logged-in page. */
export interface ProfileScrape {
  nicknameSelectors: string[];
  avatarSelectors: string[];
}

export interface PlatformAdapter {
  id: PlatformId;
  displayName: string;
  loginUrl: string;
  /** Domains used when collecting cookies */
  cookieDomains: string[];
  /**
   * 探测门槛：大致已进入登录后创作者界面，值得拉取用户信息。
   * 不是授权成功条件；成功唯一看 hasLoggedInUserInfo（id + 昵称）。
   */
  isAuthed: (cookies: CookieLike[], url: string) => boolean;
  /** Tried in order; best-effort, all of them may fail */
  profileSources?: ProfileSource[];
  profileScrape?: ProfileScrape;
  /** Cookie that already carries the user id (cheapest, most stable source) */
  userIdCookie?: string;
}

function hasAnyCookie(cookies: CookieLike[], names: string[]): boolean {
  const set = new Set(cookies.map((c) => c.name));
  return names.some((name) => set.has(name));
}

export const PLATFORM_ADAPTERS: Record<PlatformId, PlatformAdapter> = {
  douyin: {
    id: 'douyin',
    displayName: '抖音',
    loginUrl: 'https://creator.douyin.com/',
    cookieDomains: ['.douyin.com', 'douyin.com', '.creator.douyin.com'],
    // 探测门槛：创作者域且非登录页 + 会话 cookie（成功仍看用户信息）
    isAuthed: (cookies, url) => {
      const onCreator =
        url.includes('creator.douyin.com') && !url.includes('login');
      return (
        onCreator &&
        hasAnyCookie(cookies, ['sessionid', 'sessionid_ss', 'sid_tt', 'uid_tt'])
      );
    },
    profileSources: [
      {
        url: 'https://creator.douyin.com/web/api/media/user/info/',
        idPaths: ['user.uid', 'user.sec_uid', 'user.unique_id', 'uid'],
        nicknamePaths: ['user.nickname', 'user.name', 'nickname'],
        avatarPaths: [
          'user.avatar_larger.url_list[0]',
          'user.avatar_thumb.url_list[0]',
          'user.avatar_url',
        ],
      },
      {
        url: 'https://creator.douyin.com/aweme/v1/creator/user/info/',
        idPaths: ['user.uid', 'user.sec_uid', 'uid'],
        nicknamePaths: ['user.nickname', 'nickname'],
        avatarPaths: [
          'user.avatar_larger.url_list[0]',
          'user.avatar_thumb.url_list[0]',
        ],
      },
    ],
    profileScrape: {
      nicknameSelectors: [
        '[class*="nickname"]',
        '[class*="userName"]',
        '[class*="user-name"]',
      ],
      avatarSelectors: [
        'img[src*="aweme-avatar"]',
        '[class*="avatar"] img',
        'img[class*="avatar"]',
      ],
    },
  },
  toutiao: {
    id: 'toutiao',
    displayName: '今日头条',
    loginUrl: 'https://mp.toutiao.com/',
    cookieDomains: ['.toutiao.com', 'toutiao.com', 'mp.toutiao.com'],
    // 探测门槛：头条号后台且非登录页 + 会话 cookie
    isAuthed: (cookies, url) => {
      const onMp = url.includes('mp.toutiao.com') && !url.includes('login');
      return (
        onMp &&
        hasAnyCookie(cookies, ['sessionid', 'sid_tt', 'uid_tt', 'passport_csrf_token'])
      );
    },
    profileSources: [
      {
        url: 'https://mp.toutiao.com/api/v2/media/get_media_info/',
        idPaths: ['data.media.id', 'data.user.user_id', 'data.media.media_id'],
        nicknamePaths: [
          'data.media.name',
          'data.user.name',
          'data.user.screen_name',
          'data.name',
        ],
        avatarPaths: [
          'data.media.avatar_url',
          'data.user.avatar_url',
          'data.avatar_url',
        ],
      },
      {
        url: 'https://mp.toutiao.com/mp/agw/media/get_media_info',
        idPaths: ['data.media.id', 'data.user.user_id'],
        nicknamePaths: ['data.media.name', 'data.user.name'],
        avatarPaths: ['data.media.avatar_url', 'data.user.avatar_url'],
      },
    ],
    profileScrape: {
      nicknameSelectors: [
        '[class*="user-name"]',
        '[class*="userName"]',
        '[class*="nickname"]',
      ],
      avatarSelectors: ['[class*="avatar"] img', 'img[class*="avatar"]'],
    },
  },
  channels: {
    id: 'channels',
    displayName: '视频号',
    loginUrl: 'https://channels.weixin.qq.com/',
    cookieDomains: ['.weixin.qq.com', 'weixin.qq.com', 'channels.weixin.qq.com'],
    // 探测门槛：视频号后台且非登录页 + 会话 cookie
    isAuthed: (cookies, url) => {
      const onChannels =
        url.includes('channels.weixin.qq.com') && !url.includes('login');
      return (
        onChannels &&
        hasAnyCookie(cookies, ['sessionid', 'wxuin', 'data_ticket', 'slave_sid'])
      );
    },
    profileSources: [
      {
        url: 'https://channels.weixin.qq.com/micro/api/post/finder_get_user_info',
        method: 'POST',
        body: {},
        idPaths: [
          'data.finderUser.finderUsername',
          'data.finderUser.uniqId',
          'data.finderUsername',
        ],
        nicknamePaths: ['data.finderUser.nickname', 'data.nickname'],
        avatarPaths: ['data.finderUser.headImgUrl', 'data.headImgUrl'],
      },
    ],
    profileScrape: {
      nicknameSelectors: [
        '[class*="finder-nickname"]',
        '[class*="nickname"]',
        '[class*="account-name"]',
      ],
      avatarSelectors: ['[class*="avatar"] img', 'img[class*="head-img"]'],
    },
  },
  bilibili: {
    id: 'bilibili',
    displayName: '哔哩哔哩',
    loginUrl: 'https://member.bilibili.com/',
    cookieDomains: ['.bilibili.com', 'bilibili.com', 'member.bilibili.com'],
    // 探测门槛：创作中心 / 工作室且非登录页 + SESSDATA 等
    isAuthed: (cookies, url) => {
      const onMember =
        (url.includes('member.bilibili.com') ||
          url.includes('studio.bilibili.com')) &&
        !url.includes('login');
      return onMember && hasAnyCookie(cookies, ['SESSDATA', 'DedeUserID', 'bili_jct']);
    },
    // DedeUserID is the numeric uid — stable and always present once logged in.
    userIdCookie: 'DedeUserID',
    profileSources: [
      {
        url: 'https://api.bilibili.com/x/web-interface/nav',
        idPaths: ['data.mid'],
        nicknamePaths: ['data.uname'],
        avatarPaths: ['data.face'],
      },
    ],
    profileScrape: {
      nicknameSelectors: ['[class*="nickname"]', '[class*="user-name"]'],
      avatarSelectors: ['img[src*="hdslb"]', '[class*="avatar"] img'],
    },
  },
  xiaohongshu: {
    id: 'xiaohongshu',
    displayName: '小红书',
    loginUrl: 'https://creator.xiaohongshu.com/',
    cookieDomains: [
      '.xiaohongshu.com',
      'xiaohongshu.com',
      'creator.xiaohongshu.com',
    ],
    // 探测门槛：小红书创作者后台且非登录页 + 会话 cookie
    isAuthed: (cookies, url) => {
      const onCreator =
        url.includes('creator.xiaohongshu.com') && !url.includes('login');
      return (
        onCreator &&
        hasAnyCookie(cookies, [
          'web_session',
          'customer-sso-sid',
          'galaxy_creator_session_id',
          'access-token-creator.xiaohongshu.com',
        ])
      );
    },
    profileSources: [
      {
        url: 'https://creator.xiaohongshu.com/api/galaxy/user/info',
        idPaths: ['data.userId', 'data.user_id', 'data.userDetail.userId'],
        nicknamePaths: [
          'data.userName',
          'data.nickname',
          'data.userDetail.userName',
        ],
        avatarPaths: [
          'data.userAvatar',
          'data.avatar',
          'data.userDetail.userAvatar',
        ],
      },
      {
        url: 'https://edith.xiaohongshu.com/api/sns/web/v2/user/me',
        idPaths: ['data.user_id', 'data.userId', 'data.red_id'],
        nicknamePaths: ['data.nickname', 'data.name'],
        avatarPaths: ['data.images', 'data.image', 'data.avatar'],
      },
    ],
    profileScrape: {
      nicknameSelectors: [
        '[class*="nickname"]',
        '[class*="user-name"]',
        '[class*="userName"]',
      ],
      avatarSelectors: ['[class*="avatar"] img', 'img[class*="avatar"]'],
    },
  },
};

export function getPlatformAdapter(
  platform: string,
): PlatformAdapter | undefined {
  if (platform in PLATFORM_ADAPTERS) {
    return PLATFORM_ADAPTERS[platform as PlatformId];
  }
  return undefined;
}
