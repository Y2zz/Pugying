import {
  filterPlatformResources,
  parseDouyinCollectionList,
  type PlatformResourceRef,
} from "@shared/platform-resource";
import {
  cookieSessionJsonGet,
  loadAccountCookies,
  withEphemeralCookieSession,
} from "./ephemeral-cookie-session";

const MIX_LIST_URL =
  "https://creator.douyin.com/web/api/mix/list/?status=0,1,2,3,6&count=20&cursor=0&should_query_new_mix=1&device_platform=web&aid=1128";
const REFERER = "https://creator.douyin.com/creator-micro/content/upload";

const pending = new Map<string, Promise<PlatformResourceRef[]>>();
/** 合集列表近静态，按账号缓存避免字段重挂载重复请求 */
const cache = new Map<string, PlatformResourceRef[]>();

/** 按当前抖音账号读取合集列表并按关键词过滤；Cookie 直拉，不开隐藏窗。 */
export function searchDouyinCollections(
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
    listCollections(accountId)
      .catch(() => [] as PlatformResourceRef[])
      .finally(() => {
        pending.delete(accountId);
      });
  if (!current) {
    pending.set(accountId, request);
  }
  return request.then((items) => filterPlatformResources(items, keyword));
}

async function listCollections(
  accountId: string,
): Promise<PlatformResourceRef[]> {
  const cookies = await loadAccountCookies(accountId, "douyin");
  if (!cookies) {
    return [];
  }
  return withEphemeralCookieSession(
    "douyin-collection-search",
    cookies,
    async (isolated) => {
      const result = await cookieSessionJsonGet(isolated, MIX_LIST_URL, {
        Referer: REFERER,
        Origin: "https://creator.douyin.com",
      });
      if (!result || Number(result.status_code) !== 0) {
        return [];
      }
      const items = parseDouyinCollectionList(result);
      cache.set(accountId, items);
      return items;
    },
  );
}
