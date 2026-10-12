import {
  filterPlatformResources,
  parseBilibiliAnthologyList,
  type PlatformResourceRef,
} from "@shared/platform-resource";
import {
  bilibiliSignedGet,
  withBilibiliCookieApi,
} from "./bilibili-cookie-api";
import { loadAccountCookies } from "./ephemeral-cookie-session";

const pending = new Map<string, Promise<PlatformResourceRef[]>>();
/** 文集列表按账号缓存，重挂载只本地过滤 */
const cache = new Map<string, PlatformResourceRef[]>();

/** 按当前 B 站账号读取文集列表并按关键词过滤；Cookie + WBI，不开隐藏窗。 */
export function searchBilibiliAnthologies(
  accountId: string,
  keyword: string,
): Promise<PlatformResourceRef[]> {
  const cached = cache.get(accountId);
  if (cached) {
    return Promise.resolve(filterPlatformResources(cached, keyword));
  }

  const current = pending.get(accountId);
  const request =
    current ??
    listAnthologies(accountId)
      .catch(() => [] as PlatformResourceRef[])
      .finally(() => {
        pending.delete(accountId);
      });
  if (!current) {
    pending.set(accountId, request);
  }
  return request.then((items) => filterPlatformResources(items, keyword));
}

async function listAnthologies(
  accountId: string,
): Promise<PlatformResourceRef[]> {
  const cookies = await loadAccountCookies(accountId, "bilibili");
  if (!cookies) {
    return [];
  }
  return withBilibiliCookieApi(cookies, async ({ nav, isolated }) => {
    if (!nav) {
      return [];
    }
    const result = await bilibiliSignedGet(
      isolated,
      "/x/article/up/lists",
      { mid: nav.mid, sort: "0" },
      nav,
    );
    if (!result || Number(result.code) !== 0) {
      return [];
    }
    const items = parseBilibiliAnthologyList(result);
    cache.set(accountId, items);
    return items;
  });
}
