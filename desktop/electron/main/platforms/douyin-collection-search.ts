import { getApiBaseUrl, getLocalApiToken } from "../server-process";
import type { AgentCookie } from "../protocol";
import {
  filterPlatformResources,
  parseDouyinCollectionList,
  type PlatformResourceRef,
} from "@shared/platform-resource";
import { createArticleApiSession } from "./article-api-session";
import { assertArticleResponse } from "./article-api";

const MIX_LIST_QUERY =
  "status=0,1,2,3,6&count=20&cursor=0&should_query_new_mix=1&device_platform=web&aid=1128";

const pending = new Map<string, Promise<PlatformResourceRef[]>>();

/** 按当前抖音账号读取合集列表并按关键词过滤；凭据不回传 renderer。 */
export function searchDouyinCollections(
  accountId: string,
  keyword: string,
): Promise<PlatformResourceRef[]> {
  const key = accountId;
  const current = pending.get(key);
  const request =
    current ??
    listCollections(accountId)
      .catch(() => [] as PlatformResourceRef[])
      .finally(() => {
        pending.delete(key);
      });
  if (!current) {
    pending.set(key, request);
  }
  return request.then((items) => filterPlatformResources(items, keyword));
}

async function listCollections(
  accountId: string,
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
      requestId: "collection-search",
      targetId: "collection-search",
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
    const result = await api.request(`/web/api/mix/list/?${MIX_LIST_QUERY}`);
    assertArticleResponse(result, "douyin");
    return parseDouyinCollectionList(result);
  } finally {
    await api.dispose();
  }
}
