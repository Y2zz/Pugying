import { getApiBaseUrl, getLocalApiToken } from "../server-process";
import type { AgentCookie } from "../protocol";
import {
  filterPlatformResources,
  parseToutiaoCityList,
  type PlatformResourceRef,
} from "@shared/platform-resource";
import { createArticleApiSession } from "./article-api-session";

const pending = new Map<string, Promise<PlatformResourceRef[]>>();

/** 按当前头条账号读取城市列表并按关键词过滤；凭据不回传 renderer。 */
export function searchToutiaoLocations(
  accountId: string,
  keyword: string,
): Promise<PlatformResourceRef[]> {
  const key = accountId;
  const current = pending.get(key);
  const request =
    current ??
    listCities(accountId)
      .catch(() => [] as PlatformResourceRef[])
      .finally(() => {
        pending.delete(key);
      });
  if (!current) {
    pending.set(key, request);
  }
  return request.then((items) => filterPlatformResources(items, keyword));
}

async function listCities(accountId: string): Promise<PlatformResourceRef[]> {
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
  if (account.platform !== "toutiao" || !account.cookies?.length) {
    return [];
  }
  const api = await createArticleApiSession("toutiao", {
    payload: {
      requestId: "location-search",
      targetId: "location-search",
      platform: "toutiao",
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
    // 官方文章编辑器 getPositionInfo：GET /toutiao/normandy/mp/city_district/
    const result = await api.request("/toutiao/normandy/mp/city_district/");
    return parseToutiaoCityList(result);
  } finally {
    await api.dispose();
  }
}
