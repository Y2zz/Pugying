/**
 * 桌面网络策略：读盘、安装、包装 fromPartition、统一平台出站。
 * 偏好代理覆盖所有平台 Session / session.fetch；本机 Nest 与 loopback 经 PROXY_BYPASS_RULES 直连。
 */
import { app, session, type Session } from "electron";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  DEFAULT_PROXY_SETTINGS,
  toElectronProxyConfig,
  validateProxyEndpointForTest,
  validateProxySettingsForSave,
  type ProxySettings,
  type ProxyTestResult,
} from "../../shared/proxy-settings";
import { readProxySettings, saveProxySettings } from "./proxy-settings-store";

/** 轻量连通探测；任一成功即视为代理可达（网络失败才算不通） */
export const PROXY_TEST_PROBE_URLS = [
  "https://www.gstatic.com/generate_204",
  // generate_204 偶发不可达时再试国内 HTTPS，避免单一探针误杀
  "https://www.baidu.com/favicon.ico",
] as const;

const PROXY_TEST_TIMEOUT_MS = 10_000;
const PROXY_TEST_PARTITION_PREFIX = "temp:proxy-test-";

let cached: ProxySettings = { ...DEFAULT_PROXY_SETTINGS };
let initialized = false;
let installed = false;
let saveChain: Promise<void> = Promise.resolve();
/** 最近一次连通性探测成功的 endpoint；启用代理保存时必须与之匹配 */
let lastVerifiedEndpoint: { host: string; port: number } | null = null;

/** 已挂过策略的 Session；配置变更时重应用 */
const trackedSessions = new Set<Session>();

type FromPartition = typeof session.fromPartition;
let originalFromPartition: FromPartition | null = null;

function settingsPath(): string {
  return join(app.getPath("userData"), "proxy-settings.json");
}

function isProxyTestPartition(partition: string): boolean {
  return partition.startsWith(PROXY_TEST_PARTITION_PREFIX);
}

async function applyToSession(target: Session): Promise<void> {
  const config = toElectronProxyConfig(cached);
  await target.setProxy(config);
}

async function applyToAllTracked(): Promise<void> {
  trackedSessions.add(session.defaultSession);
  await Promise.all(
    [...trackedSessions].map((target) => applyToSession(target)),
  );
}

function trackSession(target: Session): void {
  trackedSessions.add(target);
}

/**
 * 包装 session.fromPartition：新建分区时挂上当前代理。
 * 探测用临时分区不入跟踪表，避免污染正式配置。
 */
function installFromPartitionHook(): void {
  if (originalFromPartition) {
    return;
  }
  originalFromPartition = session.fromPartition.bind(session) as FromPartition;
  session.fromPartition = ((partition: string, options?: Parameters<FromPartition>[1]) => {
    const created = originalFromPartition!(partition, options);
    if (!isProxyTestPartition(partition)) {
      trackSession(created);
      void applyToSession(created);
    }
    return created;
  }) as FromPartition;
}

function rawFromPartition(
  partition: string,
  options?: Parameters<FromPartition>[1],
): Session {
  const factory = originalFromPartition ?? session.fromPartition.bind(session);
  return factory(partition, options);
}

/**
 * 创建已挂当前代理的分区 Session（await setProxy 完成后再返回）。
 * 无 WebContents 的 Cookie / bdms 探测应走此入口，避免竞态漏配。
 */
export async function createNetworkSession(
  partition: string,
  options?: Parameters<FromPartition>[1],
): Promise<Session> {
  getProxySettings();
  const created = rawFromPartition(partition, options);
  if (!isProxyTestPartition(partition)) {
    trackSession(created);
  }
  await applyToSession(created);
  return created;
}

/**
 * Chromium 的 session.fetch 把 Content-Length / Transfer-Encoding 当禁止头。
 * 手写后直接 net::ERR_INVALID_ARGUMENT，请求不出进程。长度由 body 自动带上。
 */
function sessionFetchInit(init?: RequestInit): RequestInit | undefined {
  if (!init?.headers) {
    return init;
  }
  const headers = new Headers(init.headers);
  const hadLength = headers.has("content-length");
  const hadEncoding = headers.has("transfer-encoding");
  if (!hadLength && !hadEncoding) {
    return init;
  }
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  return { ...init, headers };
}

/**
 * 平台出站 HTTP：走已挂代理的 Session.fetch（默认 defaultSession）。
 * 本机 Nest / file:// 素材勿用此函数。
 */
export async function platformOutboundFetch(
  input: string | Request,
  init?: RequestInit,
  target: Session = session.defaultSession,
): Promise<Response> {
  getProxySettings();
  // 未跟踪的 Session（测试或未走工厂）首次出站时补挂；已跟踪的靠 update 批量重应用
  if (!trackedSessions.has(target)) {
    trackSession(target);
    await applyToSession(target);
  }
  return target.fetch(input, sessionFetchInit(init));
}

export function getProxySettings(): ProxySettings {
  if (!initialized) {
    initialized = true;
    cached = readProxySettings(settingsPath());
  }
  return { ...cached };
}

export async function updateProxySettings(
  input: unknown,
): Promise<ProxySettings> {
  getProxySettings();
  const update = saveChain
    .catch(() => undefined)
    .then(async () => {
      // 启用时必须已对同一 host/port 测试通过；关闭（取消）不要求
      const next = validateProxySettingsForSave(input);
      if (next.enabled) {
        if (
          !lastVerifiedEndpoint ||
          lastVerifiedEndpoint.host !== next.host ||
          lastVerifiedEndpoint.port !== next.port
        ) {
          throw new Error("请先测试");
        }
      }
      const saved = await saveProxySettings(settingsPath(), next);
      cached = saved;
      await applyToAllTracked();
    });
  saveChain = update.then(
    () => undefined,
    () => undefined,
  );
  await update;
  return { ...cached };
}

/**
 * 进程级安装：defaultSession + 包装 fromPartition。
 * 须在 app.whenReady 之后、创建窗口之前调用。
 */
export function installNetworkPolicy(): ProxySettings {
  if (installed) {
    return getProxySettings();
  }
  installed = true;
  const settings = getProxySettings();
  installFromPartitionHook();
  void applyToAllTracked();
  return settings;
}

/**
 * 用表单中的地址/端口建临时 Session 探测，不改写已应用的代理配置。
 * 「启用」开关不参与：只验证当前填写的代理是否可达。
 */
export async function testProxySettings(
  input: unknown,
): Promise<ProxyTestResult> {
  let endpoint: { host: string; port: number };
  try {
    endpoint = validateProxyEndpointForTest(input);
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error && err.message
          ? err.message
          : "请先填写服务器地址和端口",
    };
  }

  const probeSession = rawFromPartition(
    `${PROXY_TEST_PARTITION_PREFIX}${randomUUID()}`,
    { cache: false },
  );
  await probeSession.setProxy(
    toElectronProxyConfig({
      enabled: true,
      host: endpoint.host,
      port: endpoint.port,
    }),
  );

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, PROXY_TEST_TIMEOUT_MS);
  try {
    let lastError: unknown;
    for (const probeUrl of PROXY_TEST_PROBE_URLS) {
      try {
        await probeSession.fetch(probeUrl, {
          method: "GET",
          signal: controller.signal,
          redirect: "manual",
        });
        lastVerifiedEndpoint = endpoint;
        return { ok: true, message: "测试通过" };
      } catch (err) {
        lastError = err;
      }
    }
    void lastError;
    lastVerifiedEndpoint = null;
    return { ok: false, message: "连不上，请检查地址和端口" };
  } finally {
    clearTimeout(timer);
    try {
      await probeSession.clearStorageData();
    } catch {
      // 临时分区清理失败不影响结果
    }
  }
}

/** 测试用：重置模块内状态并还原 fromPartition */
export function resetNetworkPolicyForTests(): void {
  cached = { ...DEFAULT_PROXY_SETTINGS };
  initialized = false;
  installed = false;
  saveChain = Promise.resolve();
  trackedSessions.clear();
  lastVerifiedEndpoint = null;
  if (originalFromPartition) {
    session.fromPartition = originalFromPartition;
    originalFromPartition = null;
  }
}
