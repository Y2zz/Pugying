import { describe, expect, it } from "vitest";
import {
  filterPlatformResources,
  normalizeBoundPlatformResourceRef,
  normalizePlatformResourceRef,
  normalizePlatformResourceRefs,
  parseBilibiliAnthologyList,
  parseBilibiliTopicSuggestions,
  parseDouyinCollectionList,
  parseDouyinPoiSuggestions,
  parseDouyinTopicSuggestions,
  topicNames,
  topicRefsFromNames,
} from "./platform-resource";

describe("normalizePlatformResourceRef", () => {
  it("keeps numeric platform ids and strips hash prefixes", () => {
    expect(normalizePlatformResourceRef({ id: "1234", name: "#日常" })).toEqual(
      { id: "1234", name: "日常" },
    );
    expect(normalizePlatformResourceRef({ id: 42, name: "旅行" })).toEqual({
      id: "42",
      name: "旅行",
    });
  });

  it("rejects blank names, whitespace, or non-numeric ids", () => {
    expect(normalizePlatformResourceRef({ id: "123", name: " " })).toBeNull();
    expect(
      normalizePlatformResourceRef({ id: "123", name: "bad tag" }),
    ).toBeNull();
    expect(normalizePlatformResourceRef({ id: "abc", name: "日常" })).toBeNull();
  });

  it("allows spaces for bound list resources", () => {
    expect(
      normalizeBoundPlatformResourceRef({ id: "9", name: "旅行 笔记" }),
    ).toEqual({ id: "9", name: "旅行 笔记" });
    expect(
      normalizeBoundPlatformResourceRef({ id: "0", name: "未绑定" }),
    ).toBeNull();
  });
});

describe("normalizePlatformResourceRefs", () => {
  it("dedupes by id and name", () => {
    expect(
      normalizePlatformResourceRefs([
        { id: "1", name: "日常" },
        { id: "1", name: "日常副本" },
        { id: "2", name: "日常" },
        { id: "0", name: "新建" },
        { id: "0", name: "新建" },
      ]),
    ).toEqual([
      { id: "1", name: "日常" },
      { id: "0", name: "新建" },
    ]);
  });
});

describe("parseDouyinTopicSuggestions", () => {
  it("maps official challenge suggestions", () => {
    expect(
      parseDouyinTopicSuggestions({
        sug_list: [
          { cha_name: "日常", cid: "7693" },
          { challenge_name: "旅行", challenge_id: 88 },
          { cha_name: "忽略", cid: "x" },
        ],
      }),
    ).toEqual([
      { id: "7693", name: "日常" },
      { id: "88", name: "旅行" },
    ]);
  });
});

describe("topic helpers", () => {
  it("round-trips names for legacy drafts", () => {
    const refs = topicRefsFromNames(["日常", "#旅行", "日常"]);
    expect(refs).toEqual([
      { id: "0", name: "日常" },
      { id: "0", name: "旅行" },
    ]);
    expect(topicNames(refs)).toEqual(["日常", "旅行"]);
  });
});

describe("list resource parsers", () => {
  it("maps Douyin mix list and Bilibili anthology list", () => {
    expect(
      parseDouyinCollectionList({
        mix_list: [
          { mix_id: "11", mix_name: "日常合集" },
          { mix_id: "12", mix_name: "旅行 vlog" },
        ],
      }),
    ).toEqual([
      { id: "11", name: "日常合集" },
      { id: "12", name: "旅行 vlog" },
    ]);
    expect(
      parseBilibiliAnthologyList({
        data: {
          lists: [
            { id: 9, name: "旅行笔记" },
            { id: 0, name: "忽略" },
          ],
        },
      }),
    ).toEqual([{ id: "9", name: "旅行笔记" }]);
  });

  it("maps Douyin POI and Bilibili topic search results", () => {
    expect(
      parseDouyinPoiSuggestions({
        poi_list: [
          { poi_id: "6601", poi_name: "上海外滩" },
          { poi_id: "0", poi_name: "忽略" },
        ],
      }),
    ).toEqual([{ id: "6601", name: "上海外滩" }]);
    expect(
      parseBilibiliTopicSuggestions({
        data: {
          topic_items: [
            { id: 2233, name: "动画" },
            { id: 0, name: "忽略" },
          ],
        },
      }),
    ).toEqual([{ id: "2233", name: "动画" }]);
  });

  it("filters by keyword", () => {
    expect(
      filterPlatformResources(
        [
          { id: "1", name: "日常合集" },
          { id: "2", name: "旅行" },
        ],
        "旅",
      ),
    ).toEqual([{ id: "2", name: "旅行" }]);
  });
});
