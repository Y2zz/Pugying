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
  /** 顶栏菜单：显示/聚焦主窗口 */
  appShow: 'desktop:app-show',
  /** 顶栏菜单：退出应用（走 before-quit 清理） */
  appQuit: 'desktop:app-quit',
  /** 顶栏菜单：关于对话框 */
  appAbout: 'desktop:app-about',
  /** 顶栏菜单：切换业务主窗 DevTools（仅未打包） */
  toggleDevTools: 'desktop:toggle-devtools',
  /** 本机绝对路径是否可读（草稿打开 / 选片后校验） */
  checkLocalPathReadable: 'desktop:check-local-path-readable',
  /** 读取本机图片供编辑器预览，不将本机文件 URL 暴露给 renderer */
  readLocalImageDataUrl: 'desktop:read-local-image-data-url',
} as const;
