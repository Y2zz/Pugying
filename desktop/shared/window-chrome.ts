/**
 * 业务主窗窗口铬约定：macOS / Windows 隐藏标题文字；
 * macOS 避让落在侧栏；Windows 由布局顶行 DesktopTitleBar 占高度，右侧为系统
 * titleBarOverlay 按钮（最小化 / 最大化 / 关闭）。
 * Linux 暂保持系统边框，避免无控件时无法关窗。
 */
export const DESKTOP_TITLEBAR_HEIGHT = 40;

/**
 * macOS 折叠侧栏 `--sidebar-width-icon`。
 * 默认 shadcn 3rem + inset spacing(4) ≈ 64px，略窄于红绿灯集群（末端约 66px）；
 * 4rem 时 inset gap ≈ 80px，可盖住红绿灯。
 */
export const MACOS_SIDEBAR_WIDTH_ICON = '4rem';

export type DesktopWindowControls = 'trafficLights' | 'overlay' | 'none';

export type DesktopWindowChromeInfo = {
  platform: string;
  /** 为业务 UI 预留的顶栏高度（px）；有边框时为 0 */
  titleBarHeight: number;
  controls: DesktopWindowControls;
};

/** Windows titleBarOverlay 与主题对齐的近似色（避免读不到 CSS 变量） */
export const TITLEBAR_OVERLAY_THEME = {
  light: { color: '#ffffff', symbolColor: '#171717' },
  dark: { color: '#252525', symbolColor: '#fafafa' },
} as const;

export type TitleBarOverlayTheme = keyof typeof TITLEBAR_OVERLAY_THEME;

const FORCEABLE_DESKTOP_PLATFORMS = new Set(['darwin', 'win32', 'linux']);

/**
 * 开发态可用 `PUGYING_FORCE_PLATFORM` 模拟其它 OS 的窗口铬。
 * @param allowForce 发行版须为 false，避免误配影响真实控件
 */
export function resolveRuntimeDesktopPlatform(
  actualPlatform: string,
  forcePlatform: string | undefined | null,
  allowForce: boolean,
): string {
  if (!allowForce) {
    return actualPlatform;
  }
  const forced = forcePlatform?.trim();
  if (forced && FORCEABLE_DESKTOP_PLATFORMS.has(forced)) {
    return forced;
  }
  return actualPlatform;
}

/** @param platform 如 `darwin` / `win32` / `linux`；须由调用方传入，避免 shared 依赖 Node 全局 */
export function resolveDesktopWindowChrome(
  platform: string,
): DesktopWindowChromeInfo {
  if (platform === 'darwin') {
    return {
      platform,
      titleBarHeight: DESKTOP_TITLEBAR_HEIGHT,
      controls: 'trafficLights',
    };
  }
  if (platform === 'win32') {
    return {
      platform,
      titleBarHeight: DESKTOP_TITLEBAR_HEIGHT,
      controls: 'overlay',
    };
  }
  return {
    platform,
    titleBarHeight: 0,
    controls: 'none',
  };
}
