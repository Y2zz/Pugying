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

import { searchDouyinLocations } from "./douyin-location-search";

describe("searchDouyinLocations", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    createSession.mockReset();
    assertResponse.mockReset();
  });

  it("returns empty list for blank keywords without opening a session", async () => {
    await expect(searchDouyinLocations("acc", "   ")).resolves.toEqual([]);
    expect(createSession).not.toHaveBeenCalled();
  });

  it("searches the official POI endpoint with the account session", async () => {
    const request = vi.fn().mockResolvedValue({
      status_code: 0,
      poi_list: [{ poi_id: "6601", poi_name: "上海外滩" }],
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

    await expect(searchDouyinLocations("acc-1", "外滩")).resolves.toEqual([
      { id: "6601", name: "上海外滩" },
    ]);
    expect(request).toHaveBeenCalledWith(
      "/aweme/v1/life/video_api/search/poi/?keyword=%E5%A4%96%E6%BB%A9&count=20&aid=1128",
    );
    expect(dispose).toHaveBeenCalled();
  });
});
