import {
  parseBilibiliVideoOptions,
  type BilibiliVideoOptions,
} from "@shared/bilibili-video-settings";
import { articleRecord } from "./article-api";
import { fetchBilibiliArchivePre } from "./bilibili-cookie-api";
import {
  loadAccountCookies,
  withEphemeralCookieSession,
} from "./ephemeral-cookie-session";

const pending = new Map<string, Promise<BilibiliVideoOptions | null>>();
/** 分区/声明近静态，按账号缓存 */
const cache = new Map<string, BilibiliVideoOptions>();

/** 只读当前账号投稿配置；当前账号会话拉取 member 预检。 */
export function fetchBilibiliVideoOptions(
  accountId: string,
): Promise<BilibiliVideoOptions | null> {
  const cached = cache.get(accountId);
  if (cached) {
    return Promise.resolve(cached);
  }
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

/**
 * member `/x/vupre/web/archive/pre` 的 data 常无 `isLogin`（登录态在 myinfo）；
 * 补齐后供 parseBilibiliVideoOptions / 发布前校验共用。
 */
export function normalizeBilibiliArchivePre(
  result: Record<string, unknown>,
): Record<string, unknown> | null {
  // member pre 可能是 { code, data } 或直接 data 对象
  if (result.code != null && Number(result.code) !== 0) {
    return null;
  }
  const data =
    result.data !== undefined ? articleRecord(result.data) : articleRecord(result);
  if (Object.keys(data).length === 0) {
    return null;
  }
  return data.isLogin === undefined ? { ...data, isLogin: true } : data;
}

async function readOptions(
  accountId: string,
): Promise<BilibiliVideoOptions | null> {
  const cookies = await loadAccountCookies(accountId, "bilibili");
  if (!cookies) {
    return null;
  }
  return withEphemeralCookieSession(
    "bilibili-video-options",
    cookies,
    async (isolated) => {
      const result = await fetchBilibiliArchivePre(isolated);
      if (!result) {
        return null;
      }
      const options = parseBilibiliVideoOptions(
        normalizeBilibiliArchivePre(result),
      );
      if (options) {
        cache.set(accountId, options);
      }
      return options;
    },
  );
}
