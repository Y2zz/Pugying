import { getApiBaseUrl, getLocalApiToken } from "../server-process";
import type { AgentCookie } from "../protocol";
import {
  parseDouyinPoiSuggestions,
  type PlatformResourceRef,
} from "@shared/platform-resource";
import { createArticleApiSession } from "./article-api-session";
import { assertArticleResponse } from "./article-api";

const KEYWORD_MAX = 40;
const pending = new Map<string, Promise<PlatformResourceRef[]>>();

/** 按当前抖音账号搜索发布可用位置；凭据不回传 renderer。 */
export function searchDouyinLocations(
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
  const request = readLocations(accountId, query)
    .catch(() => [] as PlatformResourceRef[])
    .finally(() => {
      pending.delete(key);
    });
  pending.set(key, request);
  return request;
}

async function readLocations(
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
      requestId: "location-search",
      targetId: "location-search",
      platform: "douyin",
      accountId,
      contentType: "video",
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
      count: "20",
      aid: "1128",
    });
    const result = await api.request(
      `/aweme/v1/life/video_api/search/poi/?${params}`,
    );
    assertArticleResponse(result, "douyin");
    return parseDouyinPoiSuggestions(result);
  } finally {
    await api.dispose();
  }
}
