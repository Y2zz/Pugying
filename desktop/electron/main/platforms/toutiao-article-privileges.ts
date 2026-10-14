import { randomUUID } from "node:crypto";
import { injectCookies } from "../auth-browser";
import { createNetworkSession } from "../network-policy";
import { getApiBaseUrl, getLocalApiToken } from "../server-process";
import type { AgentCookie } from "../protocol";
import {
  parseToutiaoRewardFromPublishHtml,
  type ToutiaoRewardPrivilege,
} from "@shared/toutiao-article-privileges";

const PUBLISH_HTML_URL =
  "https://mp.toutiao.com/profile_v4/graphic/publish";

const pending = new Map<string, Promise<ToutiaoRewardPrivilege | null>>();
/** 成功结果进程内缓存，避免账号设置重挂载重复拉 HTML */
const cache = new Map<string, ToutiaoRewardPrivilege>();

/** 只读探测赞赏额度；凭证不回传 renderer。force 时绕过缓存。 */
export function fetchToutiaoRewardPrivilege(
  accountId: string,
  options?: { force?: boolean },
): Promise<ToutiaoRewardPrivilege | null> {
  if (!options?.force) {
    const cached = cache.get(accountId);
    if (cached) {
      return Promise.resolve(cached);
    }
  } else {
    cache.delete(accountId);
  }

  const current = pending.get(accountId);
  if (current) {
    return current;
  }
  const request = readPrivilege(accountId)
    .catch(() => null)
    .finally(() => {
      pending.delete(accountId);
    });
  pending.set(accountId, request);
  return request;
}

async function readPrivilege(
  accountId: string,
): Promise<ToutiaoRewardPrivilege | null> {
  const response = await fetch(
    `${getApiBaseUrl()}/platform-accounts/${encodeURIComponent(accountId)}/credentials`,
    {
      method: "POST",
      headers: { "X-Pugying-Local-Token": getLocalApiToken() },
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok) {
    return null;
  }
  const account = (await response.json()) as {
    platform?: string;
    cookies?: AgentCookie[];
  };
  if (account.platform !== "toutiao" || !account.cookies?.length) {
    return null;
  }

  // 发布页 HTML bootstrap 已含 creator_project_info.praise_count_remained，当前账号会话拉取即可
  const isolated = await createNetworkSession(
    `toutiao-article-privileges-${randomUUID()}`,
    { cache: false },
  );
  try {
    await injectCookies(isolated, account.cookies);
    const pageResponse = await isolated.fetch(PUBLISH_HTML_URL, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!pageResponse.ok) {
      return null;
    }
    const html = await pageResponse.text();
    const privilege = parseToutiaoRewardFromPublishHtml(html);
    if (privilege) {
      cache.set(accountId, privilege);
    }
    return privilege;
  } finally {
    await isolated.clearStorageData().catch(() => {});
    await isolated.clearCache().catch(() => {});
    await isolated.closeAllConnections().catch(() => {});
  }
}
