import { getApiBaseUrl, getLocalApiToken } from "../server-process";
import type { AgentCookie } from "../protocol";
import { createArticleApiSession } from "./article-api-session";
import {
  parseBilibiliVideoOptions,
  type BilibiliVideoOptions,
} from "@shared/bilibili-video-settings";

const pending = new Map<string, Promise<BilibiliVideoOptions | null>>();

/** 只读当前账号投稿配置，不上传或创建稿件；凭据不传入 renderer。 */
export function fetchBilibiliVideoOptions(
  accountId: string,
): Promise<BilibiliVideoOptions | null> {
  const current = pending.get(accountId);
  if (current) {
    return current;
  }
  const request = readOptions(accountId)
    .catch(() => null)
    .finally(() => {
      pending.delete(accountId);
    });
  pending.set(accountId, request);
  return request;
}

async function readOptions(
  accountId: string,
): Promise<BilibiliVideoOptions | null> {
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
  if (account.platform !== "bilibili" || !account.cookies?.length) {
    return null;
  }
  const api = await createArticleApiSession("bilibili", {
    payload: {
      requestId: "video-options",
      targetId: "video-options",
      platform: "bilibili",
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
    const result = await api.request("/x/vupre/web/archive/pre");
    return result.code === 0 ? parseBilibiliVideoOptions(result.data) : null;
  } finally {
    await api.dispose();
  }
}
