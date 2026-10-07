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
  /**
   * 同一账号的其它平台侧标识（如视频号 uniqId）。
   * 用于纠正误把 uniqId / 页面杂文存成 platformUserId 的旧数据。
   */
  alternateUserIds?: string[];
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
  /** JSON request body for POST sources；函数形式便于带动态 timestamp */
  body?: unknown | (() => unknown);
  /** Dotted paths into the response, e.g. 'data.user.nickname', 'a.b[0]' */
  idPaths: string[];
  nicknamePaths: string[];
  avatarPaths: string[];
  /** 辅助身份路径（如视频号号 uniqId），不写入 platformUserId */
  alternateIdPaths?: string[];
}

/** 视频号助手 auth 接口共用请求体（timestamp 须每次现取） */
function channelsAuthBody(): Record<string, unknown> {
  return {
    timestamp: String(Date.now()),
    _log_finder_uin: '',
    _log_finder_id: '',
    rawKeyBuff: null,
    pluginSessionId: null,
    scene: 7,
    reqScene: 7,
  };
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
  /**
   * 创作者中心入口；缺省等同 loginUrl。
   * 视频号授权用 login.html，打开后台必须用 /platform，否则有会话也停在扫码页。
   */
  homeUrl?: string;
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
  /** 拉取资料时的 Referer；缺省用 loginUrl */
  profileReferer?: string;
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
    // 授权扫码页；打开创作者中心必须用 homeUrl，login.html 有会话也会停在扫码
    loginUrl: 'https://channels.weixin.qq.com/login.html',
    homeUrl: 'https://channels.weixin.qq.com/platform',
    profileReferer: 'https://channels.weixin.qq.com/platform',
    cookieDomains: [
      '.weixin.qq.com',
      'weixin.qq.com',
      'channels.weixin.qq.com',
      '.channels.weixin.qq.com',
    ],
    // 探测门槛：已离开登录页 + 会话 cookie（sessionid 为权威信号）
    isAuthed: (cookies, url) => {
      const onChannels =
        url.includes('channels.weixin.qq.com') &&
        !url.includes('login');
      return (
        onChannels &&
        hasAnyCookie(cookies, [
          'sessionid',
          'sessionid_ss',
          '_finder_auth',
          'wxuin',
          'data_ticket',
          'slave_sid',
        ])
      );
    },
    profileSources: [
      {
        // 助手真实资料接口；旧 micro/api 路径已失效，会误把 uniqId 当昵称
        url: 'https://channels.weixin.qq.com/cgi-bin/mmfinderassistant-bin/auth/auth_data',
        method: 'POST',
        body: channelsAuthBody,
        idPaths: [
          'data.finderUser.finderUsername',
          'data.finderUser.username',
          'data.finderUsername',
        ],
        nicknamePaths: [
          'data.finderUser.nickname',
          'data.finderUser.nickName',
          'data.nickname',
        ],
        avatarPaths: [
          'data.finderUser.headImgUrl',
          'data.finderUser.headUrl',
          'data.headImgUrl',
        ],
        alternateIdPaths: [
          'data.finderUser.uniqId',
          'data.finderUser.finderUniqId',
        ],
      },
      {
        url: 'https://channels.weixin.qq.com/cgi-bin/mmfinderassistant-bin/auth/get_auth_info',
        method: 'POST',
        body: channelsAuthBody,
        idPaths: [
          'data.finderUser.finderUsername',
          'data.finderUser.username',
          'data.finderUsername',
        ],
        nicknamePaths: [
          'data.finderUser.nickname',
          'data.finderUser.nickName',
          'data.nickname',
        ],
        avatarPaths: [
          'data.finderUser.headImgUrl',
          'data.finderUser.headUrl',
          'data.headImgUrl',
        ],
        alternateIdPaths: [
          'data.finderUser.uniqId',
          'data.finderUser.finderUniqId',
        ],
      },
    ],
    profileScrape: {
      // 避免宽泛 [class*=nickname] 误抓到视频号号等非昵称文案
      nicknameSelectors: [
        '[class*="finder-nickname"]',
        '[class*="account-info"] [class*="name"]',
        '[class*="user-info"] [class*="nickname"]',
      ],
      avatarSelectors: [
        '[class*="finder-avatar"] img',
        '[class*="account-info"] img',
        'img[class*="head-img"]',
      ],
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
