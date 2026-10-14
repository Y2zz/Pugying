import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  fromPartition: vi.fn(),
  clearStorageData: vi.fn(),
  clearCache: vi.fn(),
  closeAllConnections: vi.fn(),
  injectCookies: vi.fn(),
  credentialsFetch: vi.fn(),
  sessionFetch: vi.fn(),
}));

vi.mock("../auth-browser", () => ({ injectCookies: fake.injectCookies }));
vi.mock("../server-process", () => ({
  getApiBaseUrl: () => "http://127.0.0.1:3928",
  getLocalApiToken: () => "test-token",
}));
vi.mock("../network-policy", () => ({
  createNetworkSession: vi.fn(async (...args: unknown[]) =>
    fake.fromPartition(...args),
  ),
}));

describe("fetchToutiaoRewardPrivilege", () => {
  let fetchToutiaoRewardPrivilege: typeof import("./toutiao-article-privileges").fetchToutiaoRewardPrivilege;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fake.credentialsFetch);
    fake.credentialsFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        platform: "toutiao",
        cookies: [{ name: "test-cookie", value: "test-value" }],
      }),
    });
    fake.fromPartition.mockReturnValue({
      fetch: fake.sessionFetch,
      clearStorageData: fake.clearStorageData,
      clearCache: fake.clearCache,
      closeAllConnections: fake.closeAllConnections,
    });
    fake.clearStorageData.mockResolvedValue(undefined);
    fake.clearCache.mockResolvedValue(undefined);
    fake.closeAllConnections.mockResolvedValue(undefined);
    fake.injectCookies.mockResolvedValue(undefined);
    fake.sessionFetch.mockResolvedValue({
      ok: true,
      text: async () =>
        `<html><script>window.__INIT__={"creator_project_info":{"creator_project_banned_flag":false,"praise_count_remained":2}}</script></html>`,
    });
    ({ fetchToutiaoRewardPrivilege } = await import(
      "./toutiao-article-privileges"
    ));
  });

  afterEach(() => vi.unstubAllGlobals());

  it("reads praise quota via cookie HTML fetch without opening a browser window", async () => {
    expect(await fetchToutiaoRewardPrivilege("account-a")).toMatchObject({
      remainingToday: 2,
      available: true,
      label: "允许赞赏（今日还有2次机会）",
    });
    expect(fake.credentialsFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:3928/platform-accounts/account-a/credentials",
      expect.objectContaining({
        method: "POST",
        headers: { "X-Pugying-Local-Token": "test-token" },
      }),
    );
    expect(fake.fromPartition.mock.calls[0][0]).toMatch(
      /^toutiao-article-privileges-/,
    );
    expect(fake.sessionFetch).toHaveBeenCalledWith(
      "https://mp.toutiao.com/profile_v4/graphic/publish",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
    expect(fake.clearStorageData).toHaveBeenCalled();
  });

  it("does not probe another platform or assume five chances when lookup fails", async () => {
    fake.credentialsFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ platform: "douyin", cookies: [{}] }),
    });
    expect(await fetchToutiaoRewardPrivilege("other")).toBeNull();
    expect(fake.fromPartition).not.toHaveBeenCalled();
    fake.credentialsFetch.mockRejectedValueOnce(new Error("offline"));
    expect(await fetchToutiaoRewardPrivilege("failed")).toBeNull();
  });

  it("deduplicates concurrent reads and caches successful results", async () => {
    const [a, b] = await Promise.all([
      fetchToutiaoRewardPrivilege("same"),
      fetchToutiaoRewardPrivilege("same"),
    ]);
    expect(a?.remainingToday).toBe(2);
    expect(b?.remainingToday).toBe(2);
    expect(fake.credentialsFetch).toHaveBeenCalledTimes(1);
    expect(fake.sessionFetch).toHaveBeenCalledTimes(1);
    expect(await fetchToutiaoRewardPrivilege("same")).toMatchObject({
      remainingToday: 2,
    });
    expect(fake.sessionFetch).toHaveBeenCalledTimes(1);
  });

  it("force refresh bypasses cache and re-reads publish HTML", async () => {
    await fetchToutiaoRewardPrivilege("same");
    fake.sessionFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        `{"creator_project_info":{"creator_project_banned_flag":false,"praise_count_remained":0}}`,
    });
    expect(
      await fetchToutiaoRewardPrivilege("same", { force: true }),
    ).toMatchObject({
      remainingToday: 0,
      available: false,
    });
    expect(fake.sessionFetch).toHaveBeenCalledTimes(2);
  });
});
