import type { AgentCookie } from "./protocol";

vi.mock("./server-process", () => ({
  getApiBaseUrl: () => "http://127.0.0.1:3928",
  getLocalApiToken: () => "local-test-token",
}));
vi.mock("./platforms/ephemeral-cookie-session", () => ({
  loadAccountCookies: vi.fn(),
  withEphemeralCookieSession: vi.fn(),
}));

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-10-13T00:00:00Z");
const cookie = (name: string, inDays: number): AgentCookie => ({
  name,
  value: "x",
  expirationDate: (NOW + inDays * DAY) / 1000,
});

async function setup(
  cookies: AgentCookie[] | null,
  login: "logged-in" | "logged-out" | "unknown" = "logged-in",
) {
  const { createAccountSessionChecker } = await import("./account-session");
  let now = NOW;
  const deps = {
    loadCookies: vi.fn(async () => cookies),
    probe: vi.fn(async () => login),
    writeStatus: vi.fn(async () => {}),
    now: () => now,
  };
  const checker = createAccountSessionChecker(deps);
  return { checker, deps, advance: (ms: number) => (now += ms) };
}

const account = {
  id: "acc-1",
  platform: "douyin" as const,
  status: "active" as const,
};

it("estimates expiry from the login session cookie, ignoring tracking cookies", async () => {
  const { estimateSessionExpiry } = await import("./account-session");
  expect(
    estimateSessionExpiry("douyin", [
      cookie("ttwid", 1),
      cookie("sessionid", 20),
    ]),
  ).toBe(NOW + 20 * DAY);
  expect(estimateSessionExpiry("bilibili", [cookie("buvid3", 1)])).toBeNull();
  expect(
    estimateSessionExpiry("xiaohongshu", [
      cookie("web_session", 300),
      cookie("galaxy_creator_session_id", 2),
    ]),
  ).toBe(NOW + 2 * DAY);
});

it("reports valid, expiring and invalid states and writes status changes back", async () => {
  const valid = await setup([cookie("sessionid", 30)]);
  expect((await valid.checker.check(account)).state).toBe("valid");
  expect(valid.deps.writeStatus).not.toHaveBeenCalled();

  const expiring = await setup([cookie("sessionid", 2)]);
  expect(await expiring.checker.check(account)).toMatchObject({
    state: "expiring",
    expiresAt: new Date(NOW + 2 * DAY).toISOString(),
  });

  const loggedOut = await setup([cookie("sessionid", 30)], "logged-out");
  expect((await loggedOut.checker.check(account)).state).toBe("invalid");
  expect(loggedOut.deps.writeStatus).toHaveBeenCalledWith("acc-1", "expired");

  const recovered = await setup([cookie("sessionid", 30)]);
  await recovered.checker.check({ ...account, status: "expired" });
  expect(recovered.deps.writeStatus).toHaveBeenCalledWith("acc-1", "active");
});

it("treats an already expired session cookie as invalid without calling the platform", async () => {
  const { checker, deps } = await setup([cookie("sessionid", -1)]);
  expect((await checker.check(account)).state).toBe("invalid");
  expect(deps.probe).not.toHaveBeenCalled();
});

it("keeps the account status when the result is unknown", async () => {
  const { checker, deps } = await setup([cookie("sessionid", 30)], "unknown");
  expect((await checker.check({ ...account, status: "expired" })).state).toBe(
    "unknown",
  );
  expect(deps.writeStatus).not.toHaveBeenCalled();
});

it("throttles real checks per account to once every 10 minutes", async () => {
  const { checker, deps, advance } = await setup([cookie("sessionid", 30)]);
  await Promise.all([checker.check(account), checker.check(account)]);
  expect(deps.probe).toHaveBeenCalledTimes(1);
  advance(9 * 60 * 1000);
  await checker.check(account);
  expect(deps.probe).toHaveBeenCalledTimes(1);
  advance(2 * 60 * 1000);
  await checker.check(account);
  expect(deps.probe).toHaveBeenCalledTimes(2);
  await checker.check(account, { force: true });
  expect(deps.probe).toHaveBeenCalledTimes(3);
});
