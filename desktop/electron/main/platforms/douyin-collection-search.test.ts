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

import { searchDouyinCollections } from "./douyin-collection-search";

describe("searchDouyinCollections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          platform: "douyin",
          cookies: [{ name: "sessionid", value: "x" }],
        }),
      })),
    );
  });

  it("lists collections and filters by keyword", async () => {
    const dispose = vi.fn(async () => {});
    const request = vi.fn(async () => ({
      status_code: 0,
      mix_list: [
        { mix_id: "11", mix_name: "日常合集" },
        { mix_id: "12", mix_name: "旅行 vlog" },
      ],
    }));
    createArticleApiSession.mockResolvedValue({ request, dispose });

    await expect(searchDouyinCollections("acc-1", "vlog")).resolves.toEqual([
      { id: "12", name: "旅行 vlog" },
    ]);
    expect(request).toHaveBeenCalledWith(
      "/web/api/mix/list/?status=0,1,2,3,6&count=20&cursor=0&should_query_new_mix=1&device_platform=web&aid=1128",
    );
    expect(dispose).toHaveBeenCalledOnce();
  });
});
