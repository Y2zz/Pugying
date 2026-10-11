import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  credentialsFetch: vi.fn(),
  injectCookies: vi.fn(),
  fromPartition: vi.fn(),
  sessionFetch: vi.fn(),
  clearStorageData: vi.fn(),
  clearCache: vi.fn(),
  closeAllConnections: vi.fn(),
}));

vi.mock("../server-process", () => ({
  getApiBaseUrl: () => "http://127.0.0.1:3928",
  getLocalApiToken: () => "token",
}));

vi.mock("../auth-browser", () => ({
  injectCookies: fake.injectCookies,
}));

vi.mock("../network-policy", () => ({
  createNetworkSession: vi.fn(async (...args: unknown[]) =>
    fake.fromPartition(...args),
  ),
}));

vi.mock("./article-api-session", () => ({
  createArticleApiSession: vi.fn(() => {
    throw new Error("createArticleApiSession should not be used");
  }),
}));

describe("searchToutiaoLocations", () => {
  let searchToutiaoLocations: typeof import("./toutiao-location-search").searchToutiaoLocations;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    globalThis.fetch = fake.credentialsFetch as unknown as typeof fetch;
    fake.injectCookies.mockResolvedValue(undefined);
    fake.clearStorageData.mockResolvedValue(undefined);
    fake.clearCache.mockResolvedValue(undefined);
    fake.closeAllConnections.mockResolvedValue(undefined);
    fake.fromPartition.mockReturnValue({
      fetch: fake.sessionFetch,
      clearStorageData: fake.clearStorageData,
      clearCache: fake.clearCache,
      closeAllConnections: fake.closeAllConnections,
    });
    ({ searchToutiaoLocations } = await import("./toutiao-location-search"));
  });

  it("rejects when credentials are unavailable", async () => {
    fake.credentialsFetch.mockResolvedValue({ ok: false });
    await expect(searchToutiaoLocations("acc", "杭州")).rejects.toThrow(
      "credentials_unavailable",
    );
    expect(fake.fromPartition).not.toHaveBeenCalled();
    expect(fake.sessionFetch).not.toHaveBeenCalled();
  });

  it("lists cities via cookie session fetch and filters by keyword", async () => {
    fake.credentialsFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        platform: "toutiao",
        cookies: [{ name: "a", value: "1", domain: ".toutiao.com" }],
      }),
    });
    // 本机 session 返回原始 snake_case，与官方页面 camelCase 不同
    fake.sessionFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 0,
        data: {
          city_list: [
            {
              cities: [
                { code: "330100", name: "杭州" },
                { code: "310100", name: "上海" },
              ],
            },
          ],
          gps_location: { city_code: "110100", city_name: "北京" },
        },
      }),
    });

    await expect(searchToutiaoLocations("acc-1", "杭")).resolves.toEqual([
      { id: "330100", name: "杭州" },
    ]);
    await expect(searchToutiaoLocations("acc-1", "")).resolves.toEqual([
      { id: "110100", name: "北京" },
      { id: "330100", name: "杭州" },
      { id: "310100", name: "上海" },
    ]);

    expect(fake.injectCookies).toHaveBeenCalledTimes(1);
    expect(fake.sessionFetch).toHaveBeenCalledTimes(1);
    expect(fake.sessionFetch).toHaveBeenCalledWith(
      "https://mp.toutiao.com/toutiao/normandy/mp/city_district/",
      expect.objectContaining({
        method: "GET",
        credentials: "include",
        headers: expect.objectContaining({
          Referer: "https://mp.toutiao.com/profile_v4/graphic/publish",
        }),
      }),
    );
    expect(fake.clearStorageData).toHaveBeenCalled();
    expect(fake.closeAllConnections).toHaveBeenCalled();
  });

  it("reuses cached cities for the same account without another fetch", async () => {
    fake.credentialsFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        platform: "toutiao",
        cookies: [{ name: "a", value: "1", domain: ".toutiao.com" }],
      }),
    });
    fake.sessionFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 0,
        data: {
          city_list: [{ cities: [{ code: "330100", name: "杭州" }] }],
        },
      }),
    });

    await searchToutiaoLocations("acc-cache", "");
    await searchToutiaoLocations("acc-cache", "杭");

    expect(fake.credentialsFetch).toHaveBeenCalledTimes(1);
    expect(fake.sessionFetch).toHaveBeenCalledTimes(1);
  });
});
