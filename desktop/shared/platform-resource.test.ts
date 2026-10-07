import { describe, expect, it } from "vitest";
import {
  normalizePlatformResourceRef,
  normalizePlatformResourceRefs,
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
