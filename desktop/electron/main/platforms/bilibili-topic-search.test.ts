import { beforeEach, describe, expect, it, vi } from "vitest";

const { createArticleApiSession, getApiBaseUrl, getLocalApiToken } = vi.hoisted(
  () => ({
    createArticleApiSession: vi.fn(),
    getApiBaseUrl: vi.fn(() => "http://127.0.0.1:3928"),
    getLocalApiToken: vi.fn(() => ""),
  }),
);

vi.mock("./article-api-session", () => ({
  createArticleApiSession,
}));

vi.mock("../server-process", () => ({
  getApiBaseUrl,
  getLocalApiToken,
}));

import { searchBilibiliTopics } from "./bilibili-topic-search";

describe("searchBilibiliTopics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          platform: "bilibili",
          cookies: [{ name: "SESSDATA", value: "x" }],
        }),
      })),
    );
  });

  it("returns empty for blank keywords", async () => {
    await expect(searchBilibiliTopics("acc", "  ")).resolves.toEqual([]);
    expect(createArticleApiSession).not.toHaveBeenCalled();
  });

  it("searches official topic candidates", async () => {
    const dispose = vi.fn(async () => {});
    const request = vi.fn(async () => ({
      code: 0,
      data: {
        topic_items: [{ id: 1101122, name: "2233异世集" }],
      },
    }));
    createArticleApiSession.mockResolvedValue({ request, dispose });

    await expect(searchBilibiliTopics("acc-1", "2233")).resolves.toEqual([
      { id: "1101122", name: "2233异世集" },
    ]);
    expect(request).toHaveBeenCalledWith(
      "/x/topic/pub/search?keywords=2233&page_size=20&page_num=1&offset=0",
    );
    expect(dispose).toHaveBeenCalledOnce();
  });
});
