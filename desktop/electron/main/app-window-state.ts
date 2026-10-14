/**
 * 业务主窗实例状态（与 IPC / 创建逻辑解耦，避免循环依赖）。
 */
import type { BrowserWindow } from 'electron';
import {
  DESKTOP_TITLEBAR_HEIGHT,
  TITLEBAR_OVERLAY_THEME,
  type TitleBarOverlayTheme,
} from '../../shared/window-chrome';
import { currentDesktopPlatform } from './desktop-platform';

let mainWindow: BrowserWindow | null = null;

export function getAppWindow(): BrowserWindow | null {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow;
  }
  return null;
}

export function setAppWindow(win: BrowserWindow | null): void {
  mainWindow = win;
}

export function hasAppWindow(): boolean {
  return getAppWindow() !== null;
}

/** Windows（含开发态强制 win32）随主题更新 overlay；其它平台 no-op */
export function applyTitleBarOverlayTheme(theme: TitleBarOverlayTheme): boolean {
  const win = getAppWindow();
  if (!win || win.isDestroyed()) {
    return false;
  }
  // 以运行时平台为准，便于 macOS 上 PUGYING_FORCE_PLATFORM=win32 联调主题色
  if (currentDesktopPlatform() !== 'win32') {
    return false;
  }
  if (typeof win.setTitleBarOverlay !== 'function') {
    return false;
  }
  const colors = TITLEBAR_OVERLAY_THEME[theme];
  win.setTitleBarOverlay({
    color: colors.color,
    symbolColor: colors.symbolColor,
    height: DESKTOP_TITLEBAR_HEIGHT,
  });
  return true;
}
