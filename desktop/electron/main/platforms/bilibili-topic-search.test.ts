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

import { searchBilibiliTopics } from "./bilibili-topic-search";

describe("searchBilibiliTopics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty for blank keywords", async () => {
    await expect(searchBilibiliTopics("acc", "  ")).resolves.toEqual([]);
    expect(fake.loadAccountCookies).not.toHaveBeenCalled();
  });

  it("searches topics with Cookie + WBI", async () => {
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
      data: { topic_items: [{ id: 1101122, name: "2233异世集" }] },
    });

    await expect(searchBilibiliTopics("acc-1", "2233")).resolves.toEqual([
      { id: "1101122", name: "2233异世集" },
    ]);
    expect(fake.bilibiliSignedGet).toHaveBeenCalledWith(
      isolated,
      "/x/topic/pub/search",
      {
        keywords: "2233",
        page_size: "20",
        page_num: "1",
        offset: "0",
      },
      nav,
    );
  });
});
