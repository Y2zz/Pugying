import {
  parseDouyinPoiSuggestions,
  type PlatformResourceRef,
} from "@shared/platform-resource";
import {
  DouyinBdmsSignError,
  signDouyinCreatorUrl,
} from "./douyin-bdms-sign";
import {
  cookieSessionJsonGet,
  loadAccountCookies,
  withEphemeralCookieSession,
} from "./ephemeral-cookie-session";

const KEYWORD_MAX = 40;
const REFERER =
  "https://creator.douyin.com/creator-micro/content/upload?default-tab=3&enter_from=publish_page&type=new";
const pending = new Map<string, Promise<PlatformResourceRef[]>>();

/** 按当前抖音账号搜索发布可用位置；主进程官方 bdms 签名 + 当前账号会话拉取。 */
export function searchDouyinLocations(
  accountId: string,
  keyword: string,
): Promise<PlatformResourceRef[]> {
  const query = keyword.trim();
  if (!query || query.length > KEYWORD_MAX) {
    return Promise.resolve([]);
  }
  const key = `${accountId}\0${query}`;
  const current = pending.get(key);
  if (current) {
    return current;
  }
  const request = readLocations(accountId, query)
    .catch(() => [] as PlatformResourceRef[])
    .finally(() => {
      pending.delete(key);
    });
  pending.set(key, request);
  return request;
}

async function readLocations(
  accountId: string,
  keyword: string,
): Promise<PlatformResourceRef[]> {
  const cookies = await loadAccountCookies(accountId, "douyin");
  if (!cookies) {
    return [];
  }
  // POI 无 a_bogus 时返回空 body；与图文发布共用主进程 bdms 签名
  const params = new URLSearchParams({
    keyword,
    count: "20",
    aid: "1128",
  });
  const path = `/aweme/v1/life/video_api/search/poi/?${params}`;
  let signedUrl: string;
  try {
    signedUrl = await signDouyinCreatorUrl(path);
  } catch (error) {
    if (error instanceof DouyinBdmsSignError) {
      return [];
    }
    throw error;
  }
  return withEphemeralCookieSession(
    "douyin-location-search",
    cookies,
    async (isolated) => {
      const result = await cookieSessionJsonGet(isolated, signedUrl, {
        Referer: REFERER,
        Origin: "https://creator.douyin.com",
      });
      if (
        !result ||
        (result.status_code != null && Number(result.status_code) !== 0)
      ) {
        return [];
      }
      return parseDouyinPoiSuggestions(result);
    },
  );
}
