import { randomUUID } from "node:crypto";
import type { Session } from "electron";
import { injectCookies } from "../auth-browser";
import { createNetworkSession } from "../network-policy";
import { getApiBaseUrl, getLocalApiToken } from "../server-process";
import type { AgentCookie } from "../protocol";

/**
 * 临时 partition + Cookie，不打开 BrowserWindow。
 * 表单探测与抖音图文 主进程会话共用；文章/视频等仍可能走 createArticleApiSession。
 */
export async function withEphemeralCookieSession<T>(
  partitionPrefix: string,
  cookies: AgentCookie[],
  run: (isolated: Session) => Promise<T>,
): Promise<T> {
  // createNetworkSession 在返回前 await setProxy，避免无 WebContents 时漏挂代理
  const isolated = await createNetworkSession(
    `${partitionPrefix}-${randomUUID()}`,
    { cache: false },
  );
  try {
    await injectCookies(isolated, cookies);
    return await run(isolated);
  } finally {
    await isolated.clearStorageData().catch(() => {});
    await isolated.clearCache().catch(() => {});
    await isolated.closeAllConnections().catch(() => {});
  }
}

/** 从本机 Server 读取账号 Cookie；平台不符或失败返回 null。 */
export async function loadAccountCookies(
  accountId: string,
  platform: string,
): Promise<AgentCookie[] | null> {
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
  if (account.platform !== platform || !account.cookies?.length) {
    return null;
  }
  return account.cookies;
}

/** Cookie 会话 JSON GET；非 2xx 或非 JSON 返回 null。 */
export async function cookieSessionJsonGet(
  isolated: Session,
  url: string,
  headers: Record<string, string>,
): Promise<Record<string, unknown> | null> {
  const response = await isolated.fetch(url, {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json, text/plain, */*",
      ...headers,
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    return null;
  }
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
