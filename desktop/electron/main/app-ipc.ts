/**
 * 业务主窗 ↔ 主进程 IPC：注册 webContents 为 bridge 客户端。
 * 不与授权壳 chrome:* handlers 共用。
 */
import { app, dialog, ipcMain, type MessageBoxOptions, type WebContents } from 'electron';
import { access, readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { extname, isAbsolute, basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';
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
  AGENT_VERSION,
  parseAgentMessage,
  type AgentEnvelope,
} from './protocol';
import { applyTitleBarOverlayTheme, getAppWindow } from './app-window-state';
import { currentDesktopPlatform } from './desktop-platform';
import { getProductLogoNativeImage } from './product-logo';
import { getApiBaseUrl, getLocalApiToken } from './server-process';

function focusOrCreateAppWindow(): void {
  const win = getAppWindow();
  if (!win) {
    // 延迟加载：app-window 已依赖本模块，同步 import 会成环
    void import('./app-window').then(({ showAppWindow }) => {
      showAppWindow();
    });
    return;
  }
  if (win.isMinimized()) {
    win.restore();
  }
  win.show();
  win.focus();
}

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
  // 草稿/选片后校验源文件是否仍可读；空路径或非绝对路径视为不可读
  ipcMain.handle(
    DESKTOP_IPC.checkLocalPathReadable,
    async (_event, rawPath: unknown): Promise<boolean> => {
      if (typeof rawPath !== 'string') {
        return false;
      }
      const filePath = rawPath.trim();
      if (!filePath || !isAbsolute(filePath)) {
        return false;
      }
      try {
        await access(filePath, fsConstants.R_OK);
        return true;
      } catch {
        return false;
      }
    },
  );
  ipcMain.handle(
    DESKTOP_IPC.readLocalImageDataUrl,
    async (event, rawPath: unknown): Promise<string | null> => {
      if (event.sender !== getAppWindow()?.webContents) {
        return null;
      }
      if (typeof rawPath !== 'string') {
        return null;
      }
      const filePath = rawPath.trim();
      if (!filePath || !isAbsolute(filePath)) {
        return null;
      }
      const mimeByExtension: Record<string, string> = {
        '.apng': 'image/apng',
        '.avif': 'image/avif',
        '.bmp': 'image/bmp',
        '.gif': 'image/gif',
        '.heic': 'image/heic',
        '.heif': 'image/heif',
        '.jpeg': 'image/jpeg',
        '.jpg': 'image/jpeg',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
        '.webp': 'image/webp',
      };
      const mimeType = mimeByExtension[extname(filePath).toLowerCase()];
      if (!mimeType) {
        return null;
      }
      try {
        const fileStat = await stat(filePath);
        if (!fileStat.isFile()) {
          return null;
        }
        const contents = await readFile(filePath);
        return `data:${mimeType};base64,${contents.toString('base64')}`;
      } catch {
        return null;
      }
    },
  );

  ipcMain.handle(
    DESKTOP_IPC.saveArticleImage,
    async (
      event,
      dataUrl: unknown,
      sourcePath: unknown,
    ): Promise<string | null> => {
      const win = getAppWindow();
      if (
        !win ||
        event.sender !== win.webContents ||
        typeof dataUrl !== 'string' ||
        dataUrl.length > 48 * 1024 * 1024 ||
        !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl)
      ) {
        return null;
      }
      const bytes = Buffer.from(
        dataUrl.slice('data:image/png;base64,'.length),
        'base64',
      );
      if (
        !bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      ) {
        return null;
      }
      const source =
        typeof sourcePath === 'string' && isAbsolute(sourcePath)
          ? sourcePath
          : null;
      if (source) {
        // 裁剪产生的新文件随草稿保留；源图片不拷贝、不覆盖，无独立素材库。
        const directory = join(app.getPath('userData'), 'article-images');
        await mkdir(directory, { recursive: true });
        const path = join(directory, `${basename(source, extname(source))}-裁剪-${randomUUID()}.png`);
        await writeFile(path, bytes, { flag: 'wx' });
        return path;
      }
      const result = await dialog.showSaveDialog(win, {
        title: '保存文章图片',
        defaultPath: join(app.getPath('pictures'), `文章图片-${randomUUID().slice(0, 8)}.png`),
        filters: [{ name: 'PNG 图片', extensions: ['png'] }],
      });
      if (result.canceled || !result.filePath) {
        return null;
      }
      await writeFile(result.filePath, bytes, { flag: 'wx' });
      return result.filePath;
    },
  );

  ipcMain.handle(DESKTOP_IPC.appShow, () => {
    focusOrCreateAppWindow();
  });

  ipcMain.handle(DESKTOP_IPC.appQuit, () => {
    app.quit();
  });

  ipcMain.handle(DESKTOP_IPC.appAbout, async (event) => {
    const win = getAppWindow();
    const options: MessageBoxOptions = {
      type: 'info',
      title: '关于蒲公英',
      message: '蒲公英',
      detail: `版本 ${AGENT_VERSION}\n个人单机版`,
      buttons: ['确定'],
      defaultId: 0,
      noLink: true,
      icon: getProductLogoNativeImage(),
    };
    // 仅当调用方就是业务主窗时做模态父窗，避免误绑到其它 webContents
    if (win && !win.isDestroyed() && event.sender === win.webContents) {
      await dialog.showMessageBox(win, options);
      return;
    }
    await dialog.showMessageBox(options);
  });

  // 发行版不暴露 DevTools，避免把调试入口留给终端用户
  ipcMain.handle(DESKTOP_IPC.toggleDevTools, (event) => {
    if (app.isPackaged) {
      return false;
    }
    const wc = event.sender;
    if (wc.isDestroyed()) {
      return false;
    }
    wc.toggleDevTools();
    return true;
  });

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
