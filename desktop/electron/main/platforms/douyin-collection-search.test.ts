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

import { searchDouyinCollections } from "./douyin-collection-search";

describe("searchDouyinCollections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists collections via cookie fetch and filters by keyword", async () => {
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
      mix_list: [
        { mix_id: "11", mix_name: "日常合集" },
        { mix_id: "12", mix_name: "旅行 vlog" },
      ],
    });

    await expect(searchDouyinCollections("acc-1", "vlog")).resolves.toEqual([
      { id: "12", name: "旅行 vlog" },
    ]);
    expect(fake.cookieSessionJsonGet).toHaveBeenCalledWith(
      isolated,
      expect.stringContaining("/web/api/mix/list/"),
      expect.any(Object),
    );
  });
});
