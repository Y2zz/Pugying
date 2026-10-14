import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  loadAccountCookies: vi.fn(),
  withEphemeralCookieSession: vi.fn(),
  cookieSessionJsonGet: vi.fn(),
  signDouyinCreatorUrl: vi.fn(),
}));

vi.mock("./ephemeral-cookie-session", () => ({
  loadAccountCookies: fake.loadAccountCookies,
  withEphemeralCookieSession: fake.withEphemeralCookieSession,
  cookieSessionJsonGet: fake.cookieSessionJsonGet,
}));

vi.mock("./douyin-bdms-sign", () => ({
  DouyinBdmsSignError: class DouyinBdmsSignError extends Error {
    constructor(
      readonly code: string,
      message: string,
    ) {
      super(message);
      this.name = "DouyinBdmsSignError";
    }
  },
  signDouyinCreatorUrl: fake.signDouyinCreatorUrl,
}));

import { searchDouyinLocations } from "./douyin-location-search";

describe("searchDouyinLocations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fake.withEphemeralCookieSession.mockImplementation(
      async (_prefix: string, _cookies: unknown, run: (s: unknown) => unknown) =>
        run({}),
    );
  });

  it("returns empty list for blank keywords without signing", async () => {
    await expect(searchDouyinLocations("acc", "   ")).resolves.toEqual([]);
    expect(fake.loadAccountCookies).not.toHaveBeenCalled();
    expect(fake.signDouyinCreatorUrl).not.toHaveBeenCalled();
  });

  it("searches POI via main-process bdms sign and Cookie HTTP", async () => {
    fake.loadAccountCookies.mockResolvedValue([
      { name: "sessionid", value: "x" },
    ]);
    fake.signDouyinCreatorUrl.mockResolvedValue(
      "https://creator.douyin.com/aweme/v1/life/video_api/search/poi/?keyword=%E5%A4%96%E6%BB%A9&count=20&aid=1128&a_bogus=signed",
    );
    fake.cookieSessionJsonGet.mockResolvedValue({
      status_code: 0,
      poi_list: [{ poi_id: "6601", poi_name: "上海外滩" }],
    });

    await expect(searchDouyinLocations("acc-1", "外滩")).resolves.toEqual([
      { id: "6601", name: "上海外滩" },
    ]);
    expect(fake.signDouyinCreatorUrl).toHaveBeenCalledWith(
      "/aweme/v1/life/video_api/search/poi/?keyword=%E5%A4%96%E6%BB%A9&count=20&aid=1128",
    );
    expect(fake.cookieSessionJsonGet).toHaveBeenCalledWith(
      {},
      "https://creator.douyin.com/aweme/v1/life/video_api/search/poi/?keyword=%E5%A4%96%E6%BB%A9&count=20&aid=1128&a_bogus=signed",
      expect.objectContaining({
        Origin: "https://creator.douyin.com",
      }),
    );
  });

  it("returns empty when bdms signing fails", async () => {
    const { DouyinBdmsSignError } = await import("./douyin-bdms-sign");
    fake.loadAccountCookies.mockResolvedValue([
      { name: "sessionid", value: "x" },
    ]);
    fake.signDouyinCreatorUrl.mockRejectedValue(
      new DouyinBdmsSignError("BDMS_SIGN_FAILED", "暂时无法自动发布，请稍后重试"),
    );
    await expect(searchDouyinLocations("acc-2", "外滩")).resolves.toEqual([]);
    expect(fake.cookieSessionJsonGet).not.toHaveBeenCalled();
  });
});
