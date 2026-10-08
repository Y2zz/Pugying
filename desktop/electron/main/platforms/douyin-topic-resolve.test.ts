import { describe, expect, it, vi } from "vitest";
import { resolveDouyinTopics } from "./douyin-topic-resolve";

describe("resolveDouyinTopics", () => {
  it("keeps saved platform ids without searching", async () => {
    const request = vi.fn();
    await expect(
      resolveDouyinTopics(
        { request } as never,
        { topicRefs: [{ id: "555", name: "绑定" }] },
      ),
    ).resolves.toEqual([{ id: "555", name: "绑定" }]);
    expect(request).not.toHaveBeenCalled();
  });

  it("searches unbound tag names and falls back to id 0", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        status_code: 0,
        sug_list: [{ cha_name: "日常", cid: "99" }],
      })
      .mockResolvedValueOnce({ status_code: 0, sug_list: [] });
    await expect(
      resolveDouyinTopics(
        { request } as never,
        { tags: ["日常", "新建"] },
      ),
    ).resolves.toEqual([
      { id: "99", name: "日常" },
      { id: "0", name: "新建" },
    ]);
  });
});
