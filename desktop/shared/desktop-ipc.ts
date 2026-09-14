/**
 * 业务主窗 IPC 信道（与授权壳 chrome:* 完全隔离）。
 * 传输层仍复用 AgentEnvelope，便于 agent-client 与 WS 协议对齐。
 */
export const DESKTOP_IPC = {
  /** renderer → main */
  message: 'desktop:message',
  /** main → renderer（hello / progress / result / closed） */
  push: 'desktop:push',
  /** 本机 Nest API 基址 */
  getApiBaseUrl: 'desktop:get-api-base-url',
  /** 本次桌面进程的本机 API 通道令牌 */
  getLocalApiToken: 'desktop:get-local-api-token',
  /** 主窗标题栏铬信息（高度 / 控件形态） */
  getWindowChrome: 'desktop:get-window-chrome',
  /** Windows：同步 titleBarOverlay 颜色 */
  setTitleBarOverlay: 'desktop:set-title-bar-overlay',
} as const;
