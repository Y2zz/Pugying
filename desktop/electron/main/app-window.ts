/**
 * 业务主窗：加载 electron-vite 业务 renderer（index.html）。
 * 本机能力经业务 preload IPC（pugyingDesktop），不挂授权壳 chrome:*。
 * macOS：hiddenInset + 红绿灯；Windows：hidden + titleBarOverlay（系统 caption）+ DesktopTitleBar 顶行。
 * Linux 暂用系统边框。
 */
import appIconAsset from '../../assets/app-icon.png?asset';
import { BrowserWindow, shell, type BrowserWindowConstructorOptions } from 'electron';
import path from 'path';
import { attachAppWindowBridge } from './app-ipc';
import { getAppWindow, setAppWindow } from './app-window-state';
import {
  DESKTOP_TITLEBAR_HEIGHT,
  resolveDesktopWindowChrome,
  TITLEBAR_OVERLAY_THEME,
} from '../../shared/window-chrome';
import { currentDesktopPlatform } from './desktop-platform';

export {
  getAppWindow,
  hasAppWindow,
  applyTitleBarOverlayTheme,
} from './app-window-state';

let quitting = false;

export function markAppQuitting(): void {
  quitting = true;
}

/**
 * 解析业务 UI：PUGYING_APP_URL 覆盖 → electron-vite 开发服 → 打包后 renderer/index.html
 */
export function resolveAppLoadTarget():
  | { kind: 'url'; url: string }
  | { kind: 'file'; filePath: string } {
  const override = process.env.PUGYING_APP_URL?.trim();
  if (override) {
    return { kind: 'url', url: override };
  }

  const rendererUrl = process.env.ELECTRON_RENDERER_URL?.trim();
  if (rendererUrl && process.env.PUGYING_APP_FILE !== '1') {
    return { kind: 'url', url: rendererUrl.replace(/\/$/, '') + '/' };
  }

  return {
    kind: 'file',
    filePath: path.join(__dirname, '../renderer/index.html'),
  };
}

/** 供单测与 createAppWindow 共用的窗口选项；默认跟随运行时平台（含开发态强制模拟） */
export function buildAppWindowOptions(
  platform: string = currentDesktopPlatform(),
): BrowserWindowConstructorOptions {
  const chrome = resolveDesktopWindowChrome(platform);
  const base: BrowserWindowConstructorOptions = {
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: '蒲公英',
    // Win/Linux 任务栏与窗口图标；macOS Dock 由 app.dock / 打包 icns 负责
    icon: appIconAsset,
    backgroundColor: TITLEBAR_OVERLAY_THEME.light.color,
    webPreferences: {
      // 业务窗专用 preload（pugyingDesktop）；禁止 nodeIntegration，与 chromeShell 隔离
      preload: appPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };

  if (chrome.controls === 'trafficLights') {
    // inset 侧栏 container 有 p-2；红绿灯垂直居中于「顶栏避让区 − 该内边距」
    const sidebarInsetPad = 8;
    return {
      ...base,
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: {
        x: 14,
        y:
          sidebarInsetPad +
          Math.round((DESKTOP_TITLEBAR_HEIGHT - sidebarInsetPad - 12) / 2),
      },
    };
  }

  if (chrome.controls === 'overlay') {
    // 系统绘制最小化/最大化/关闭；DesktopTitleBar 只占顶行背景与拖拽区
    return {
      ...base,
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: TITLEBAR_OVERLAY_THEME.light.color,
        symbolColor: TITLEBAR_OVERLAY_THEME.light.symbolColor,
        height: DESKTOP_TITLEBAR_HEIGHT,
      },
    };
  }

  return base;
}

function appPreloadPath(): string {
  return path.join(__dirname, '../preload/app.js');
}

async function loadAppUi(win: BrowserWindow): Promise<void> {
  const target = resolveAppLoadTarget();
  if (target.kind === 'url') {
    await win.loadURL(target.url);
    return;
  }
  await win.loadFile(target.filePath);
}

export function showAppWindow(): void {
  const win = getAppWindow();
  if (!win) {
    createAppWindow();
    return;
  }
  if (win.isMinimized()) {
    win.restore();
  }
  win.show();
  win.focus();
}

export function createAppWindow(): BrowserWindow {
  const existing = getAppWindow();
  if (existing) {
    showAppWindow();
    return existing;
  }

  const win = new BrowserWindow(buildAppWindowOptions());

  setAppWindow(win);
  attachAppWindowBridge(win.webContents);

  win.once('ready-to-show', () => {
    win.show();
  });

  win.on('close', (event) => {
    // 关主窗不退出：托盘 + 本机 Server 仍需常驻
    if (!quitting) {
      event.preventDefault();
      win.hide();
    }
  });

  win.on('closed', () => {
    if (getAppWindow() === win) {
      setAppWindow(null);
    }
  });

  // 外链用系统浏览器，避免在业务窗内跳到平台站
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  void loadAppUi(win).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[pugying-desktop] failed to load app UI:', message);
  });

  return win;
}
