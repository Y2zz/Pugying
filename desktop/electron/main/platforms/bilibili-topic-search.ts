import { getApiBaseUrl, getLocalApiToken } from "../server-process";
import type { AgentCookie } from "../protocol";
import {
  parseBilibiliTopicSuggestions,
  type PlatformResourceRef,
} from "@shared/platform-resource";
import { createArticleApiSession } from "./article-api-session";
import { assertArticleResponse } from "./article-api";

const KEYWORD_MAX = 40;
const pending = new Map<string, Promise<PlatformResourceRef[]>>();

/** 按当前 B 站账号搜索发布话题；凭据不回传 renderer。 */
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
  const response = await fetch(
    `${getApiBaseUrl()}/platform-accounts/${encodeURIComponent(accountId)}/credentials`,
    {
      method: "POST",
      headers: { "X-Pugying-Local-Token": getLocalApiToken() },
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok) {
    return [];
  }
  const account = (await response.json()) as {
    platform?: string;
    cookies?: AgentCookie[];
  };
  if (account.platform !== "bilibili" || !account.cookies?.length) {
    return [];
  }
  const api = await createArticleApiSession("bilibili", {
    payload: {
      requestId: "topic-search",
      targetId: "topic-search",
      platform: "bilibili",
      accountId,
      contentType: "article",
      title: "",
      coverPath: "",
      cookies: account.cookies,
    },
    signal: { cancelled: false },
    onProgress: () => {},
  });
  try {
    const params = new URLSearchParams({
      keywords: keyword,
      page_size: "20",
      page_num: "1",
      offset: "0",
    });
    const result = await api.request(`/x/topic/pub/search?${params}`);
    assertArticleResponse(result, "bilibili");
    return parseBilibiliTopicSuggestions(result);
  } finally {
    await api.dispose();
  }
}
