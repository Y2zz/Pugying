import {
  parseDouyinTopicSuggestions,
  type PlatformResourceRef,
} from "@shared/platform-resource";
import {
  cookieSessionJsonGet,
  loadAccountCookies,
  withEphemeralCookieSession,
} from "./ephemeral-cookie-session";

const KEYWORD_MAX = 40;
const REFERER =
  "https://creator.douyin.com/creator-micro/content/post/article?enter_from=publish_page&media_type=article&type=new";
const pending = new Map<string, Promise<PlatformResourceRef[]>>();

/** 按当前抖音账号搜索官方话题候选项；当前账号会话拉取。 */
export function searchDouyinTopics(
  accountId: string,
  keyword: string,
): Promise<PlatformResourceRef[]> {
  const query = keyword.trim().replace(/^#+/, "");
  if (!query || query.length > KEYWORD_MAX) {
    return Promise.resolve([]);
  }
  const key = `${accountId}\0${query}`;
  const current = pending.get(key);
  if (current) {
    return current;
  }
  const request = readTopics(accountId, query)
    .catch(() => [] as PlatformResourceRef[])
    .finally(() => {
      pending.delete(key);
    });
  pending.set(key, request);
  return request;
}

async function readTopics(
  accountId: string,
  keyword: string,
): Promise<PlatformResourceRef[]> {
  const cookies = await loadAccountCookies(accountId, "douyin");
  if (!cookies) {
    return [];
  }
  // challengesug 实测仅需登录 Cookie + Referer，无需 a_bogus / 创作者整页
  return withEphemeralCookieSession(
    "douyin-topic-search",
    cookies,
    async (isolated) => {
      const params = new URLSearchParams({
        keyword,
        source: "challenge_create",
        aid: "2906",
      });
      const result = await cookieSessionJsonGet(
        isolated,
        `https://creator.douyin.com/aweme/v1/search/challengesug/?${params}`,
        {
          Referer: REFERER,
          Origin: "https://creator.douyin.com",
        },
      );
      if (!result || Number(result.status_code) !== 0) {
        return [];
      }
      return parseDouyinTopicSuggestions(result);
    },
  );
}
