/**
 * 业务主窗 preload：仅暴露 pugyingDesktop，绝不挂 chromeShell。
 */
import { contextBridge, ipcRenderer } from 'electron';
import { DESKTOP_IPC } from '@shared/desktop-ipc';
import type {
  DesktopWindowChromeInfo,
  TitleBarOverlayTheme,
} from '@shared/window-chrome';

const pugyingDesktop = {
  available: true as const,
  postMessage: (message: unknown) => {
    ipcRenderer.send(DESKTOP_IPC.message, message);
  },
  onMessage: (callback: (message: unknown) => void) => {
    const handler = (_event: unknown, message: unknown) => {
      callback(message);
    };
    ipcRenderer.on(DESKTOP_IPC.push, handler);
    return () => {
      ipcRenderer.removeListener(DESKTOP_IPC.push, handler);
    };
  },
  getApiBaseUrl: (): Promise<string> =>
    ipcRenderer.invoke(DESKTOP_IPC.getApiBaseUrl) as Promise<string>,
  getLocalApiToken: (): Promise<string> =>
    ipcRenderer.invoke(DESKTOP_IPC.getLocalApiToken) as Promise<string>,
  getWindowChrome: (): Promise<DesktopWindowChromeInfo> =>
    ipcRenderer.invoke(
      DESKTOP_IPC.getWindowChrome,
    ) as Promise<DesktopWindowChromeInfo>,
  setTitleBarOverlay: (theme: TitleBarOverlayTheme): Promise<boolean> =>
    ipcRenderer.invoke(
      DESKTOP_IPC.setTitleBarOverlay,
      theme,
    ) as Promise<boolean>,
  showAppWindow: (): Promise<void> =>
    ipcRenderer.invoke(DESKTOP_IPC.appShow) as Promise<void>,
  quitApp: (): Promise<void> =>
    ipcRenderer.invoke(DESKTOP_IPC.appQuit) as Promise<void>,
  showAbout: (): Promise<void> =>
    ipcRenderer.invoke(DESKTOP_IPC.appAbout) as Promise<void>,
  toggleDevTools: (): Promise<boolean> =>
    ipcRenderer.invoke(DESKTOP_IPC.toggleDevTools) as Promise<boolean>,
};

export type PugyingDesktopBridge = typeof pugyingDesktop;

contextBridge.exposeInMainWorld('pugyingDesktop', pugyingDesktop);
