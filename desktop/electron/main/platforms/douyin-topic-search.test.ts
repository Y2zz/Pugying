import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  loadAccountCookies: vi.fn(),
  withEphemeralCookieSession: vi.fn(),
  cookieSessionJsonGet: vi.fn(),
}));

vi.mock("./ephemeral-cookie-session", () => ({
  loadAccountCookies: fake.loadAccountCookies,
  withEphemeralCookieSession: fake.withEphemeralCookieSession,
  cookieSessionJsonGet: fake.cookieSessionJsonGet,
}));

import { searchDouyinTopics } from "./douyin-topic-search";

describe("searchDouyinTopics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty list for blank keywords without opening a session", async () => {
    await expect(searchDouyinTopics("acc", "   ")).resolves.toEqual([]);
    expect(fake.loadAccountCookies).not.toHaveBeenCalled();
  });

  it("searches challengesug with cookie session only", async () => {
    const isolated = {};
    fake.loadAccountCookies.mockResolvedValue([
      { name: "sessionid", value: "x" },
    ]);
    fake.withEphemeralCookieSession.mockImplementation(
      async (_prefix: string, _cookies: unknown, run: (s: unknown) => Promise<unknown>) =>
        run(isolated),
    );
    fake.cookieSessionJsonGet.mockResolvedValue({
      status_code: 0,
      sug_list: [{ cha_name: "日常", cid: "1234" }],
    });

    await expect(searchDouyinTopics("acc-1", "#日常")).resolves.toEqual([
      { id: "1234", name: "日常" },
    ]);
    expect(fake.cookieSessionJsonGet).toHaveBeenCalledWith(
      isolated,
      expect.stringContaining(
        "/aweme/v1/search/challengesug/?keyword=%E6%97%A5%E5%B8%B8&source=challenge_create&aid=2906",
      ),
      expect.objectContaining({ Referer: expect.stringContaining("creator.douyin.com") }),
    );
  });
});
