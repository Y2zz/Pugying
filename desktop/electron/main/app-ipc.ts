/**
 * 业务主窗 ↔ 主进程 IPC：注册 webContents 为 bridge 客户端。
 * 不与授权壳 chrome:* handlers 共用。
 */
import { ipcMain, type WebContents } from 'electron';
import { DESKTOP_IPC } from '@shared/desktop-ipc';
import {
  resolveDesktopWindowChrome,
  type TitleBarOverlayTheme,
} from '@shared/window-chrome';
import {
  handleBridgeMessage,
  registerBridgeClient,
} from './desktop-bridge';
import {
  parseAgentMessage,
  type AgentEnvelope,
} from './protocol';
import { applyTitleBarOverlayTheme } from './app-window-state';
import { currentDesktopPlatform } from './desktop-platform';
import { getApiBaseUrl, getLocalApiToken } from './server-process';

const unregisterByContents = new WeakMap<WebContents, () => void>();
let ipcWired = false;

function clientIdFor(wc: WebContents): string {
  return `ipc:${wc.id}`;
}

/**
 * 将业务窗 webContents 挂到 desktop-bridge；销毁或重复注册时自动清理。
 */
export function attachAppWindowBridge(wc: WebContents): void {
  unregisterByContents.get(wc)?.();

  const unregister = registerBridgeClient({
    id: clientIdFor(wc),
    send: (message) => {
      if (wc.isDestroyed()) {
        return;
      }
      wc.send(DESKTOP_IPC.push, message);
    },
  }, { greet: false });
  unregisterByContents.set(wc, unregister);

  wc.once('destroyed', () => {
    unregisterByContents.get(wc)?.();
    unregisterByContents.delete(wc);
  });
}

export function wireDesktopIpc(): void {
  if (ipcWired) {
    return;
  }
  ipcWired = true;

  ipcMain.handle(DESKTOP_IPC.getApiBaseUrl, () => getApiBaseUrl());
  ipcMain.handle(DESKTOP_IPC.getLocalApiToken, () => getLocalApiToken());
  ipcMain.handle(DESKTOP_IPC.getWindowChrome, () =>
    resolveDesktopWindowChrome(currentDesktopPlatform()),
  );
  ipcMain.handle(
    DESKTOP_IPC.setTitleBarOverlay,
    (_event, theme: unknown) => {
      if (theme !== 'light' && theme !== 'dark') {
        return false;
      }
      return applyTitleBarOverlayTheme(theme as TitleBarOverlayTheme);
    },
  );

  ipcMain.on(DESKTOP_IPC.message, (event, raw: unknown) => {
    const wc = event.sender;
    if (wc.isDestroyed()) {
      return;
    }

    // 晚到消息：确保该 webContents 已登记（例如首帧在 attach 前发出）
    if (!unregisterByContents.has(wc)) {
      attachAppWindowBridge(wc);
    }

    const message =
      typeof raw === 'string'
        ? parseAgentMessage(raw)
        : (raw as AgentEnvelope | null);
    if (
      !message ||
      typeof message !== 'object' ||
      typeof (message as AgentEnvelope).type !== 'string'
    ) {
      wc.send(DESKTOP_IPC.push, {
        type: 'error',
        payload: { message: 'Invalid message' },
      } satisfies AgentEnvelope);
      return;
    }

    handleBridgeMessage(clientIdFor(wc), message as AgentEnvelope);
  });
}
