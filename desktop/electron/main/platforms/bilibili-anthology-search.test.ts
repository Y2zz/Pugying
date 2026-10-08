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

import { searchBilibiliAnthologies } from "./bilibili-anthology-search";

describe("searchBilibiliAnthologies", () => {
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

  it("lists anthologies for the account and filters by keyword", async () => {
    const dispose = vi.fn(async () => {});
    const request = vi.fn(async (path: string) => {
      if (path.includes("/nav")) {
        return { code: 0, data: { isLogin: true, mid: 42 } };
      }
      return {
        code: 0,
        data: {
          lists: [
            { id: 9, name: "旅行笔记" },
            { id: 8, name: "技术分享" },
          ],
        },
      };
    });
    createArticleApiSession.mockResolvedValue({ request, dispose });

    await expect(searchBilibiliAnthologies("acc-1", "旅行")).resolves.toEqual([
      { id: "9", name: "旅行笔记" },
    ]);
    expect(request).toHaveBeenCalledWith("/x/article/up/lists?mid=42&sort=0");
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("returns empty list when credentials are unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false })),
    );
    await expect(searchBilibiliAnthologies("acc", "")).resolves.toEqual([]);
    expect(createArticleApiSession).not.toHaveBeenCalled();
  });
});
