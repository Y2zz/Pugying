/**
 * 用户代理偏好契约：偏好页 ↔ 主进程 IPC ↔ Electron session.setProxy。
 * 环回旁路集中在此，避免各处漏配导致本机 Nest 被误转发。
 */

export interface ProxySettings {
  /** 总开关；关闭时直连，可保留 host/port */
  enabled: boolean;
  host: string;
  port: number | null;
}

export const DEFAULT_PROXY_SETTINGS: ProxySettings = {
  enabled: false,
  host: "",
  port: null,
};

/** Chromium proxyBypassRules：本机与无点号主机直连；禁止使用 <-loopback> */
export const PROXY_BYPASS_RULES =
  "<local>,localhost,127.0.0.1,[::1]";

export interface ElectronProxyConfig {
  mode: "direct" | "fixed_servers";
  proxyRules?: string;
  proxyBypassRules?: string;
}

/** 连通性探测结果（用户文案已克制，不含实现细节） */
export type ProxyTestResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

/**
 * 探测用：必须有合法 host/port（与「启用」开关无关，只测当前填写的代理）。
 * @throws Error 用户可见短文案
 */
export function validateProxyEndpointForTest(input: unknown): {
  host: string;
  port: number;
} {
  if (!input || typeof input !== "object") {
    throw new Error("请先填写服务器地址和端口");
  }
  const record = input as Record<string, unknown>;
  const host = normalizeProxyHost(record.host);
  if (host === null || !host) {
    throw new Error("请输入服务器地址");
  }
  const port = normalizePortInput(record.port);
  if (port === undefined || port === null) {
    throw new Error("请输入端口");
  }
  return { host, port };
}

export function isProxyPort(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= 65535
  );
}

/**
 * 规范化主机名：去空白；拒绝含协议、路径或空白的输入。
 */
export function normalizeProxyHost(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const host = value.trim();
  if (!host) {
    return "";
  }
  if (/\s/.test(host) || /:\/\//.test(host) || /[/?#]/.test(host)) {
    return null;
  }
  // 允许 host 或 host:port 误填时拆端口由调用方处理；此处只收纯主机或 IP
  if (host.includes(":") && !host.startsWith("[")) {
    // IPv4 无冒号；hostname:port 形态拒绝，端口应单独字段
    return null;
  }
  return host;
}

function normalizePortInput(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "number") {
    return isProxyPort(value) ? value : undefined;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const n = Number(trimmed);
    return isProxyPort(n) ? n : undefined;
  }
  return undefined;
}

/**
 * 从磁盘 / IPC 宽松解析；损坏字段回落到默认，不抛错。
 */
export function parseProxySettings(raw: unknown): ProxySettings {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_PROXY_SETTINGS };
  }
  const record = raw as Record<string, unknown>;
  const host = normalizeProxyHost(record.host);
  const port = normalizePortInput(record.port);
  return {
    enabled: record.enabled === true,
    host: host === null ? "" : host,
    port: port === undefined ? null : port,
  };
}

/**
 * 保存前校验。关闭时允许空 host/port；开启时两者必填且合法。
 * @throws Error 用户可见短文案
 */
export function validateProxySettingsForSave(input: unknown): ProxySettings {
  if (!input || typeof input !== "object") {
    throw new Error("代理设置无效，请重试");
  }
  const record = input as Record<string, unknown>;
  const enabled = record.enabled === true;
  const host = normalizeProxyHost(record.host);
  if (host === null) {
    throw new Error("请输入有效的服务器地址");
  }
  const port = normalizePortInput(record.port);
  if (port === undefined) {
    throw new Error("请输入 1–65535 之间的端口");
  }

  if (enabled) {
    if (!host) {
      throw new Error("请输入服务器地址");
    }
    if (port === null) {
      throw new Error("请输入端口");
    }
  }

  return { enabled, host, port };
}

/**
 * 转为 Electron session.setProxy 参数。
 * 开关关或 host/port 不完整时直连，避免半配置把流量打到无效代理。
 */
export function toElectronProxyConfig(
  settings: ProxySettings,
): ElectronProxyConfig {
  const host = settings.host.trim();
  if (!settings.enabled || !host || !isProxyPort(settings.port)) {
    return { mode: "direct" };
  }
  return {
    mode: "fixed_servers",
    proxyRules: `http://${host}:${settings.port}`,
    proxyBypassRules: PROXY_BYPASS_RULES,
  };
}
