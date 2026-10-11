import { randomUUID } from "node:crypto";
import { injectCookies } from "../auth-browser";
import { createNetworkSession } from "../network-policy";
import { getApiBaseUrl, getLocalApiToken } from "../server-process";
import type { AgentCookie } from "../protocol";
import {
  filterPlatformResources,
  parseToutiaoCityList,
  type PlatformResourceRef,
} from "@shared/platform-resource";

const CITY_LIST_URL =
  "https://mp.toutiao.com/toutiao/normandy/mp/city_district/";
const REFERER = "https://mp.toutiao.com/profile_v4/graphic/publish";

/** 进行中请求去重（同账号并发只打一次） */
const pending = new Map<string, Promise<PlatformResourceRef[]>>();
/** 成功结果进程内缓存；城市列表近静态，避免字段重挂载再开会话 */
const cache = new Map<string, PlatformResourceRef[]>();

/** 按当前头条账号读取城市列表并按关键词过滤；凭据不回传 renderer。 */
export function searchToutiaoLocations(
  accountId: string,
  keyword: string,
): Promise<PlatformResourceRef[]> {
  const cached = cache.get(accountId);
  if (cached) {
    return Promise.resolve(filterPlatformResources(cached, keyword));
  }

  const current = pending.get(accountId);
  // 失败向上抛，避免 UI 把网络/登录错误显示成「没有匹配的候选项」
  const request =
    current ??
    listCities(accountId).finally(() => {
      pending.delete(accountId);
    });
  if (!current) {
    pending.set(accountId, request);
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
    throw new Error("credentials_unavailable");
  }
  const account = (await response.json()) as {
    platform?: string;
    cookies?: AgentCookie[];
  };
  if (account.platform !== "toutiao" || !account.cookies?.length) {
    throw new Error("credentials_unavailable");
  }

  // 官方 getPositionInfo 无签名，仅需登录 Cookie + Referer；不必打开创作者整页
  const isolated = await createNetworkSession(
    `toutiao-city-list-${randomUUID()}`,
    { cache: false },
  );
  try {
    await injectCookies(isolated, account.cookies);
    const cityResponse = await isolated.fetch(CITY_LIST_URL, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json, text/plain, */*",
        Referer: REFERER,
        Origin: "https://mp.toutiao.com",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!cityResponse.ok) {
      throw new Error(
        cityResponse.status === 401 || cityResponse.status === 403
          ? "credentials_unavailable"
          : "city_list_rejected",
      );
    }
    const result = (await cityResponse.json()) as Record<string, unknown>;
    const code = result.code ?? result.err_no ?? result.errNo;
    if (code != null && Number(code) !== 0) {
      throw new Error("city_list_rejected");
    }
    const cities = parseToutiaoCityList(result);
    if (cities.length === 0) {
      throw new Error("city_list_empty");
    }
    cache.set(accountId, cities);
    return cities;
  } finally {
    await isolated.clearStorageData().catch(() => {});
    await isolated.clearCache().catch(() => {});
    await isolated.closeAllConnections().catch(() => {});
  }
}
