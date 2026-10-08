import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSession, assertResponse } = vi.hoisted(() => ({
  createSession: vi.fn(),
  assertResponse: vi.fn(),
}));

vi.mock("../server-process", () => ({
  getApiBaseUrl: () => "http://127.0.0.1:3928",
  getLocalApiToken: () => "",
}));

vi.mock("./article-api-session", () => ({
  createArticleApiSession: createSession,
}));

vi.mock("./article-api", () => ({
  assertArticleResponse: assertResponse,
}));

import { searchDouyinTopics } from "./douyin-topic-search";

describe("searchDouyinTopics", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    createSession.mockReset();
    assertResponse.mockReset();
  });

  it("returns empty list for blank keywords without opening a session", async () => {
    await expect(searchDouyinTopics("acc", "   ")).resolves.toEqual([]);
    expect(createSession).not.toHaveBeenCalled();
  });

  it("searches the official challenge endpoint with the account session", async () => {
    const request = vi.fn().mockResolvedValue({
      status_code: 0,
      sug_list: [{ cha_name: "日常", cid: "1234" }],
    });
    const dispose = vi.fn().mockResolvedValue(undefined);
    createSession.mockResolvedValue({ request, dispose });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          platform: "douyin",
          cookies: [{ name: "sessionid", value: "x" }],
        }),
      }),
    );

    await expect(searchDouyinTopics("acc-1", "#日常")).resolves.toEqual([
      { id: "1234", name: "日常" },
    ]);
    expect(request).toHaveBeenCalledWith(
      "/aweme/v1/search/challengesug/?keyword=%E6%97%A5%E5%B8%B8&source=challenge_create&aid=2906",
    );
    expect(dispose).toHaveBeenCalled();
  });
});
