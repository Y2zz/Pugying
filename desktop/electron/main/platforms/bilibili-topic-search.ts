import {
  parseBilibiliTopicSuggestions,
  type PlatformResourceRef,
} from "@shared/platform-resource";
import {
  bilibiliSignedGet,
  withBilibiliCookieApi,
} from "./bilibili-cookie-api";
import { loadAccountCookies } from "./ephemeral-cookie-session";

const KEYWORD_MAX = 40;
const pending = new Map<string, Promise<PlatformResourceRef[]>>();

/** 按当前 B 站账号搜索发布话题；Cookie + WBI，不开隐藏窗。 */
export function searchBilibiliTopics(
  accountId: string,
  keyword: string,
): Promise<PlatformResourceRef[]> {
  const query = keyword.trim();
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
  const cookies = await loadAccountCookies(accountId, "bilibili");
  if (!cookies) {
    return [];
  }
  return withBilibiliCookieApi(cookies, async ({ nav, isolated }) => {
    if (!nav) {
      return [];
    }
    const result = await bilibiliSignedGet(
      isolated,
      "/x/topic/pub/search",
      {
        keywords: keyword,
        page_size: "20",
        page_num: "1",
        offset: "0",
      },
      nav,
    );
    if (!result || Number(result.code) !== 0) {
      return [];
    }
    return parseBilibiliTopicSuggestions(result);
  });
}
