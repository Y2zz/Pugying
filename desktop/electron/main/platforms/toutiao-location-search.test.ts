import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock, createSession, dispose, request } = vi.hoisted(() => {
  const dispose = vi.fn(async () => {});
  const request = vi.fn();
  return {
    fetchMock: vi.fn(),
    createSession: vi.fn(async () => ({ request, dispose })),
    dispose,
    request,
  };
});

vi.mock("../server-process", () => ({
  getApiBaseUrl: () => "http://127.0.0.1:3928",
  getLocalApiToken: () => "token",
}));

vi.mock("./article-api-session", () => ({
  createArticleApiSession: createSession,
}));

globalThis.fetch = fetchMock as unknown as typeof fetch;

import { searchToutiaoLocations } from "./toutiao-location-search";

describe("searchToutiaoLocations", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    createSession.mockClear();
    dispose.mockClear();
    request.mockReset();
  });

  it("returns empty when credentials are unavailable", async () => {
    fetchMock.mockResolvedValue({ ok: false });
    await expect(searchToutiaoLocations("acc", "杭州")).resolves.toEqual([]);
    expect(createSession).not.toHaveBeenCalled();
  });

  it("lists cities and filters by keyword", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        platform: "toutiao",
        cookies: [{ name: "a", value: "1", domain: ".toutiao.com" }],
      }),
    });
    request.mockResolvedValue({
      data: {
        cityList: [
          {
            cities: [
              { code: "330100", name: "杭州" },
              { code: "310100", name: "上海" },
            ],
          },
        ],
        gpsLocation: { cityCode: "110100", cityName: "北京" },
      },
    });
    await expect(searchToutiaoLocations("acc-1", "杭")).resolves.toEqual([
      { id: "330100", name: "杭州" },
    ]);
    await expect(searchToutiaoLocations("acc-1", "")).resolves.toEqual([
      { id: "110100", name: "北京" },
      { id: "330100", name: "杭州" },
      { id: "310100", name: "上海" },
    ]);
    expect(request).toHaveBeenCalledWith("/toutiao/normandy/mp/city_district/");
    expect(dispose).toHaveBeenCalled();
  });
});
