import {
  normalizePlatformResourceRefs,
  parseDouyinTopicSuggestions,
  topicNames,
  topicRefsFromNames,
  type PlatformResourceRef,
} from "../../../shared/platform-resource";
import {
  assertArticleResponse,
  type ArticleApiSession,
} from "./article-api";

/** 优先使用选择器保存的标识；未绑定名称再按官方搜索补齐。 */
export async function resolveDouyinTopics(
  api: ArticleApiSession,
  input: {
    topicRefs?: PlatformResourceRef[];
    tags?: string[];
  },
  maxCount = 5,
): Promise<PlatformResourceRef[]> {
  const saved = normalizePlatformResourceRefs(input.topicRefs, maxCount);
  const seed =
    saved.length > 0 ? saved : topicRefsFromNames(input.tags ?? []);
  const resolved: PlatformResourceRef[] = [];
  for (const item of seed.slice(0, maxCount)) {
    if (item.id !== "0") {
      resolved.push(item);
      continue;
    }
    const query = new URLSearchParams({
      keyword: item.name,
      source: "challenge_create",
      aid: "2906",
    });
    const response = await api.request(
      `/aweme/v1/search/challengesug/?${query}`,
    );
    assertArticleResponse(response, "douyin");
    const match = parseDouyinTopicSuggestions(response).find(
      (candidate) => candidate.name === item.name,
    );
    resolved.push(match ?? item);
  }
  return normalizePlatformResourceRefs(resolved, maxCount);
}

export function douyinTopicNames(refs: PlatformResourceRef[]): string[] {
  return topicNames(refs);
}
