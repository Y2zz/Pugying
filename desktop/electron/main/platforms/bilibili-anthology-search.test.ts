import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  loadAccountCookies: vi.fn(),
  withBilibiliCookieApi: vi.fn(),
  bilibiliSignedGet: vi.fn(),
}));

vi.mock("./ephemeral-cookie-session", () => ({
  loadAccountCookies: fake.loadAccountCookies,
}));

vi.mock("./bilibili-cookie-api", () => ({
  withBilibiliCookieApi: fake.withBilibiliCookieApi,
  bilibiliSignedGet: fake.bilibiliSignedGet,
}));

import { searchBilibiliAnthologies } from "./bilibili-anthology-search";

describe("searchBilibiliAnthologies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists anthologies with Cookie + WBI and filters by keyword", async () => {
    const nav = { mid: "42", imageKey: "img", subKey: "sub" };
    const isolated = {};
    fake.loadAccountCookies.mockResolvedValue([
      { name: "SESSDATA", value: "x" },
    ]);
    fake.withBilibiliCookieApi.mockImplementation(
      async (
        _cookies: unknown,
        run: (ctx: { isolated: unknown; nav: typeof nav }) => Promise<unknown>,
      ) => run({ isolated, nav }),
    );
    fake.bilibiliSignedGet.mockResolvedValue({
      code: 0,
      data: {
        lists: [
          { id: 9, name: "旅行笔记" },
          { id: 8, name: "技术分享" },
        ],
      },
    });

    await expect(searchBilibiliAnthologies("acc-1", "旅行")).resolves.toEqual([
      { id: "9", name: "旅行笔记" },
    ]);
    expect(fake.bilibiliSignedGet).toHaveBeenCalledWith(
      isolated,
      "/x/article/up/lists",
      { mid: "42", sort: "0" },
      nav,
    );
  });

  it("returns empty when credentials are unavailable", async () => {
    fake.loadAccountCookies.mockResolvedValue(null);
    await expect(searchBilibiliAnthologies("acc", "")).resolves.toEqual([]);
    expect(fake.withBilibiliCookieApi).not.toHaveBeenCalled();
  });
});
