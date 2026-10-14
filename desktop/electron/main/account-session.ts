import type {
  AccountSessionHealth,
  AccountSessionState,
} from "../../shared/account-session";
import {
  ACCOUNT_CHECK_THROTTLE_MS,
  ACCOUNT_EXPIRING_WITHIN_MS,
} from "../../shared/account-session";
import type { AgentCookie } from "./protocol";
import { getPlatformAdapter, type PlatformId } from "./platforms/adapters";
import {
  loadAccountCookies,
  withEphemeralCookieSession,
} from "./platforms/ephemeral-cookie-session";
import { ChannelsGraphicClient } from "./platforms/channels-graphic-client";
import { probeLoginState } from "./platforms/fetch-profile";
import { getApiBaseUrl, getLocalApiToken } from "./server-process";

/**
 * 估算到期时间所用的登录会话 Cookie，按优先级取第一个带过期时间的。
 * 只看真正承载登录态的会话 Cookie，不看埋点/风控类 Cookie（如 ttwid、a1、buvid3），
 * 后者寿命与登录无关，会让估算失真。
 * - 抖音 / 今日头条（字节系）：sessionid → sessionid_ss → sid_tt → sid_guard
 * - 视频号：sessionid → _finder_auth
 * - 哔哩哔哩：SESSDATA → bili_jct
 * - 小红书：galaxy_creator_session_id（创作服务平台）→ access-token-creator.xiaohongshu.com → web_session
 */
export const SESSION_COOKIES: Record<PlatformId, string[]> = {
  douyin: ["sessionid", "sessionid_ss", "sid_tt", "sid_guard"],
  toutiao: ["sessionid", "sessionid_ss", "sid_tt", "sid_guard"],
  channels: ["sessionid", "_finder_auth"],
  bilibili: ["SESSDATA", "bili_jct"],
  xiaohongshu: [
    "galaxy_creator_session_id",
    "access-token-creator.xiaohongshu.com",
    "web_session",
  ],
};

/** 会话 Cookie 预计到期时间（毫秒时间戳）；浏览器会话级 Cookie 或缺失时返回 null。 */
export function estimateSessionExpiry(
  platform: PlatformId,
  cookies: Array<Pick<AgentCookie, "name" | "expirationDate">>,
): number | null {
  for (const name of SESSION_COOKIES[platform] ?? []) {
    const cookie = cookies.find(
      (item) => item.name === name && typeof item.expirationDate === "number",
    );
    if (cookie?.expirationDate) {
      return cookie.expirationDate * 1000;
    }
  }
  return null;
}

export interface AccountSessionDeps {
  loadCookies: (
    accountId: string,
    platform: PlatformId,
  ) => Promise<AgentCookie[] | null>;
  probe: (
    platform: PlatformId,
    cookies: AgentCookie[],
  ) => Promise<"logged-in" | "logged-out" | "unknown">;
  writeStatus: (
    accountId: string,
    status: "active" | "expired",
  ) => Promise<void>;
  now: () => number;
}

const defaultDeps: AccountSessionDeps = {
  loadCookies: (accountId, platform) => loadAccountCookies(accountId, platform),
  probe: (platform, cookies) =>
    // 视频号助手接口对 Electron session.fetch 统一回 300333，改走发布同款请求
    platform === "channels"
      ? new ChannelsGraphicClient(cookies).probeLogin()
      : withEphemeralCookieSession("account-check", cookies, async (isolated) => {
      const adapter = getPlatformAdapter(platform);
      return adapter ? probeLoginState(isolated, adapter) : "unknown";
    }),
  writeStatus: async (accountId, status) => {
    await fetch(
      `${getApiBaseUrl()}/platform-accounts/${encodeURIComponent(accountId)}/status`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Pugying-Local-Token": getLocalApiToken(),
        },
        body: JSON.stringify({ status }),
        signal: AbortSignal.timeout(10000),
      },
    );
  },
  now: () => Date.now(),
};

export interface AccountRef {
  id: string;
  displayName?: string;
  platform: PlatformId;
  status: "active" | "expired" | "revoked";
}

/**
 * 登录检测：只读请求平台用户信息接口，绝不发布。同一账号 10 分钟内复用上次结果
 * （缓存在主进程内存，随应用退出清空）；并发的同账号检测合并为一次。
 */
export function createAccountSessionChecker(
  deps: AccountSessionDeps = defaultDeps,
) {
  const cache = new Map<string, { at: number; health: AccountSessionHealth }>();
  const pending = new Map<string, Promise<AccountSessionHealth>>();

  async function run(account: AccountRef): Promise<AccountSessionHealth> {
    const checkedAt = new Date(deps.now()).toISOString();
    const cookies = await deps
      .loadCookies(account.id, account.platform)
      .catch(() => null);
    if (!cookies) {
      return {
        accountId: account.id,
        state: "unknown",
        expiresAt: null,
        checkedAt,
      };
    }
    const expiry = estimateSessionExpiry(account.platform, cookies);
    let state: AccountSessionState;
    if (expiry !== null && expiry <= deps.now()) {
      // Cookie 已过期，平台不会再认，无需发请求。
      state = "invalid";
    } else {
      const login = await deps
        .probe(account.platform, cookies)
        .catch(() => "unknown" as const);
      state =
        login === "logged-out"
          ? "invalid"
          : login === "unknown"
            ? "unknown"
            : expiry !== null &&
                expiry - deps.now() < ACCOUNT_EXPIRING_WITHIN_MS
              ? "expiring"
              : "valid";
    }
    const next =
      state === "invalid" ? "expired" : state === "unknown" ? null : "active";
    if (next && next !== account.status && account.status !== "revoked") {
      await deps.writeStatus(account.id, next).catch(() => {});
    }
    return {
      accountId: account.id,
      state,
      expiresAt: expiry === null ? null : new Date(expiry).toISOString(),
      checkedAt,
    };
  }

  async function check(
    account: AccountRef,
    options: { force?: boolean } = {},
  ): Promise<AccountSessionHealth> {
    const cached = cache.get(account.id);
    if (
      !options.force &&
      cached &&
      deps.now() - cached.at < ACCOUNT_CHECK_THROTTLE_MS
    ) {
      return cached.health;
    }
    const inflight = pending.get(account.id);
    if (inflight) {
      return inflight;
    }
    const task = run(account)
      .then((health) => {
        // 无法判断时不缓存，下次进入页面再试。
        if (health.state !== "unknown") {
          cache.set(account.id, { at: deps.now(), health });
        }
        return health;
      })
      .finally(() => {
        pending.delete(account.id);
      });
    pending.set(account.id, task);
    return task;
  }

  /** 重新授权后清掉旧结果 */
  function forget(accountId: string): void {
    cache.delete(accountId);
  }

  return { check, forget };
}

const checker = createAccountSessionChecker();

async function listAccounts(): Promise<AccountRef[]> {
  const response = await fetch(`${getApiBaseUrl()}/platform-accounts`, {
    headers: { "X-Pugying-Local-Token": getLocalApiToken() },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    throw new Error("未能读取账号");
  }
  return (await response.json()) as AccountRef[];
}

/** 页面打开时的后台检测；最多同时检测 2 个账号，避免同时打开过多连接。 */
export async function checkAccountSessions(
  accountIds: string[],
  options: { force?: boolean } = {},
): Promise<AccountSessionHealth[]> {
  const accounts = (await listAccounts()).filter(
    (account) =>
      accountIds.includes(account.id) && account.status !== "revoked",
  );
  const results: AccountSessionHealth[] = [];
  let index = 0;
  const worker = async () => {
    while (index < accounts.length) {
      const account = accounts[index++]!;
      if (options.force) {
        checker.forget(account.id);
      }
      results.push(await checker.check(account));
    }
  };
  await Promise.all([worker(), worker()]);
  return results;
}

/** 发布前检测：返回已确认失效的账号；网络无法判断时放行，由发布结果兜底。 */
export async function findInvalidAccounts(
  accountIds: string[],
): Promise<AccountRef[]> {
  if (accountIds.length === 0) {
    return [];
  }
  const accounts = (await listAccounts()).filter((account) =>
    accountIds.includes(account.id),
  );
  const invalid: AccountRef[] = [];
  for (const account of accounts) {
    const health = await checker.check(account);
    if (health.state === "invalid") {
      invalid.push(account);
    }
  }
  return invalid;
}

export function forgetAccountSession(accountId: string): void {
  checker.forget(accountId);
}
