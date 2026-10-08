import { getApiBaseUrl, getLocalApiToken } from "../server-process";
import type { AgentCookie } from "../protocol";
import {
  filterPlatformResources,
  parseBilibiliAnthologyList,
  type PlatformResourceRef,
} from "@shared/platform-resource";
import { createArticleApiSession } from "./article-api-session";
import { articleRecord, assertArticleResponse } from "./article-api";

const pending = new Map<string, Promise<PlatformResourceRef[]>>();

/** 按当前 B 站账号读取文集列表并按关键词过滤；凭据不回传 renderer。 */
export function searchBilibiliAnthologies(
  accountId: string,
  keyword: string,
): Promise<PlatformResourceRef[]> {
  const key = accountId;
  const current = pending.get(key);
  const request =
    current ??
    listAnthologies(accountId)
      .catch(() => [] as PlatformResourceRef[])
      .finally(() => {
        pending.delete(key);
      });
  if (!current) {
    pending.set(key, request);
  }
  return request.then((items) => filterPlatformResources(items, keyword));
}

async function listAnthologies(
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
  if (account.platform !== "bilibili" || !account.cookies?.length) {
    return [];
  }
  const api = await createArticleApiSession("bilibili", {
    payload: {
      requestId: "anthology-search",
      targetId: "anthology-search",
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
    const nav = await api.request("/x/web-interface/nav");
    assertArticleResponse(nav, "bilibili");
    const user = articleRecord(nav.data);
    if (user.isLogin !== true || !user.mid) {
      return [];
    }
    const mid = String(user.mid);
    if (!/^\d+$/.test(mid)) {
      return [];
    }
    const result = await api.request(
      `/x/article/up/lists?mid=${encodeURIComponent(mid)}&sort=0`,
    );
    assertArticleResponse(result, "bilibili");
    return parseBilibiliAnthologyList(result);
  } finally {
    await api.dispose();
  }
}
