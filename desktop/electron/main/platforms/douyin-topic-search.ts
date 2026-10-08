import { getApiBaseUrl, getLocalApiToken } from "../server-process";
import type { AgentCookie } from "../protocol";
import {
  parseDouyinTopicSuggestions,
  type PlatformResourceRef,
} from "@shared/platform-resource";
import { createArticleApiSession } from "./article-api-session";
import { assertArticleResponse } from "./article-api";

const KEYWORD_MAX = 40;
const pending = new Map<string, Promise<PlatformResourceRef[]>>();

/** 按当前抖音账号搜索官方话题候选项；凭据不回传 renderer。 */
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
  if (account.platform !== "douyin" || !account.cookies?.length) {
    return [];
  }
  const api = await createArticleApiSession("douyin", {
    payload: {
      requestId: "topic-search",
      targetId: "topic-search",
      platform: "douyin",
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
      keyword,
      source: "challenge_create",
      aid: "2906",
    });
    const result = await api.request(
      `/aweme/v1/search/challengesug/?${params}`,
    );
    assertArticleResponse(result, "douyin");
    return parseDouyinTopicSuggestions(result);
  } finally {
    await api.dispose();
  }
}
