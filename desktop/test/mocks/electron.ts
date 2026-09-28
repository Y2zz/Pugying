/**
 * Minimal Electron stand-in for unit tests (wired up via the `electron`
 * alias in vitest.config.ts). Mirrors the export structure of the real
 * `electron` module, but only the API surface the agent's main process
 * actually touches: app paths/dock, BrowserWindow, WebContentsView, Tray,
 * Menu, ipcMain/ipcRenderer, session partitions, Notification, clipboard,
 * shell, nativeImage and contextBridge.
 *
 * Everything is inert: no windows, no network, no OS integration. Methods
 * record just enough state (`sent` messages, `_partitions`) for tests to
 * observe behaviour without a running Electron instance.
 */
import { EventEmitter } from 'events';
import os from 'os';
import path from 'path';

export interface FakeSentMessage {
  channel: string;
  payload: unknown;
}

class FakeNavigationHistory {
  canGoBack(): boolean {
    return false;
  }

  canGoForward(): boolean {
    return false;
  }
}

class FakeWebContents extends EventEmitter {
  /** Messages delivered via `send`, for test assertions. */
  sent: FakeSentMessage[] = [];
  navigationHistory = new FakeNavigationHistory();
  private destroyed = false;
  private url = '';
  private title = '';
  private zoomFactor = 1;

  send(channel: string, payload?: unknown): void {
    this.sent.push({ channel, payload });
  }

  loadURL(url: string): Promise<void> {
    this.url = url;
    return Promise.resolve();
  }

  loadFile(_filePath: string, _options?: unknown): Promise<void> {
    return Promise.resolve();
  }

  getURL(): string {
    return this.url;
  }

  getTitle(): string {
    return this.title;
  }

  canGoBack(): boolean {
    return false;
  }

  canGoForward(): boolean {
    return false;
  }

  goBack(): void {}

  goForward(): void {}

  reload(): void {}

  reloadIgnoringCache(): void {}

  getZoomFactor(): number {
    return this.zoomFactor;
  }

  setZoomFactor(factor: number): void {
    this.zoomFactor = factor;
  }

  focus(): void {}

  setWindowOpenHandler(_handler: unknown): void {}

  executeJavaScript(_script: string, _userGesture?: boolean): Promise<unknown> {
    return Promise.resolve(undefined);
  }

  openDevTools(_options?: unknown): void {}

  isDestroyed(): boolean {
    return this.destroyed;
  }

  close(): void {
    this.destroyed = true;
  }
}

export class WebContentsView {
  webContents = new FakeWebContents();
  private visible = true;
  private bounds = { x: 0, y: 0, width: 0, height: 0 };

  constructor(_options?: unknown) {}

  setBounds(bounds: { x: number; y: number; width: number; height: number }): void {
    this.bounds = bounds;
  }

  getBounds(): { x: number; y: number; width: number; height: number } {
    return this.bounds;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
  }

  getVisible(): boolean {
    return this.visible;
  }

  setBackgroundColor(_color: string): void {}
}

class FakeContentView {
  children: unknown[] = [];

  addChildView(view: unknown): void {
    if (!this.children.includes(view)) {
      this.children.push(view);
    }
  }

  removeChildView(view: unknown): void {
    this.children = this.children.filter((child) => child !== view);
  }
}

export class BrowserWindow extends EventEmitter {
  webContents = new FakeWebContents();
  contentView = new FakeContentView();
  private destroyed = false;
  private minimized = false;
  private maximized = false;
  private title: string;

  constructor(options?: { title?: string }) {
    super();
    this.title = options?.title ?? '';
  }

  getTitle(): string {
    return this.title;
  }

  getContentSize(): [number, number] {
    return [1200, 860];
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  isMinimized(): boolean {
    return this.minimized;
  }

  isMaximized(): boolean {
    return this.maximized;
  }

  minimize(): void {
    this.minimized = true;
  }

  maximize(): void {
    this.maximized = true;
    this.emit('maximize');
  }

  unmaximize(): void {
    this.maximized = false;
    this.emit('unmaximize');
  }

  restore(): void {
    this.minimized = false;
    if (this.maximized) {
      this.unmaximize();
    }
  }

  show(): void {}

  focus(): void {}

  close(): void {
    this.emit('close');
    this.destroyed = true;
    this.emit('closed');
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.emit('closed');
  }
}

interface FakeCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expirationDate?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}

class FakeCookies {
  store: FakeCookie[] = [];

  get(_filter: unknown): Promise<FakeCookie[]> {
    return Promise.resolve([...this.store]);
  }

  set(details: FakeCookie & { url?: string }): Promise<void> {
    this.store.push({
      name: details.name,
      value: details.value,
      domain: details.domain,
      path: details.path,
      expirationDate: details.expirationDate,
      httpOnly: details.httpOnly,
      secure: details.secure,
      sameSite: details.sameSite,
    });
    return Promise.resolve();
  }

  remove(_url: string, _name: string): Promise<void> {
    return Promise.resolve();
  }
}

class FakeWebRequest {
  onCompleted(_filter: unknown, _listener: unknown): void {}
}

class FakeSession {
  cookies = new FakeCookies();
  webRequest = new FakeWebRequest();

  clearCache(): Promise<void> {
    return Promise.resolve();
  }

  clearStorageData(_options?: unknown): Promise<void> {
    this.cookies.store = [];
    return Promise.resolve();
  }

  fetch(_url: string, _init?: unknown): Promise<{
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
  }> {
    return Promise.resolve({
      ok: false,
      status: 503,
      json: () => Promise.resolve({}),
    });
  }
}

const sessionsByPartition = new Map<string, FakeSession>();

export const session = {
  defaultSession: new FakeSession(),
  /** Partition names requested so far — mock-only, for assertions. */
  _partitions: [] as string[],
  fromPartition(partition: string, _options?: unknown): FakeSession {
    this._partitions.push(partition);
    let existing = sessionsByPartition.get(partition);
    if (!existing) {
      existing = new FakeSession();
      sessionsByPartition.set(partition, existing);
    }
    return existing;
  },
};

export const app = {
  isPackaged: false,
  dock: {
    show(): Promise<void> {
      return Promise.resolve();
    },
    hide(): void {},
  },
  getPath(name: string): string {
    return path.join(os.tmpdir(), 'pugying-desktop-test', name);
  },
  whenReady(): Promise<void> {
    return Promise.resolve();
  },
  on(_event: string, _listener: unknown): typeof app {
    return app;
  },
  quit(): void {},
};

const ipcHandlers = new Map<string, unknown>();

export const ipcMain = {
  handle(channel: string, listener: unknown): void {
    ipcHandlers.set(channel, listener);
  },
  removeHandler(channel: string): void {
    ipcHandlers.delete(channel);
  },
  on(_channel: string, _listener: unknown): typeof ipcMain {
    return ipcMain;
  },
};

export const ipcRenderer = {
  invoke(_channel: string, ..._args: unknown[]): Promise<unknown> {
    return Promise.resolve(undefined);
  },
  on(_channel: string, _listener: unknown): typeof ipcRenderer {
    return ipcRenderer;
  },
  removeListener(_channel: string, _listener: unknown): typeof ipcRenderer {
    return ipcRenderer;
  },
  send(_channel: string, ..._args: unknown[]): void {},
};

export const contextBridge = {
  exposeInMainWorld(_key: string, _api: unknown): void {},
};

export class Tray extends EventEmitter {
  private destroyed = false;

  constructor(_image?: unknown) {
    super();
  }

  setContextMenu(_menu: unknown): void {}

  setToolTip(_tooltip: string): void {}

  popUpContextMenu(): void {}

  isDestroyed(): boolean {
    return this.destroyed;
  }

  destroy(): void {
    this.destroyed = true;
  }
}

export const Menu = {
  buildFromTemplate(template: unknown[]): { items: unknown[] } {
    return { items: template };
  },
  setApplicationMenu(_menu: unknown): void {},
};

export class Notification {
  constructor(_options?: { title?: string; body?: string }) {}

  static isSupported(): boolean {
    return false;
  }

  show(): void {}
}

class FakeNativeImage {
  private empty: boolean;

  constructor(empty: boolean) {
    this.empty = empty;
  }

  isEmpty(): boolean {
    return this.empty;
  }

  resize(_options: { width?: number; height?: number }): FakeNativeImage {
    return new FakeNativeImage(this.empty);
  }

  setTemplateImage(_flag: boolean): void {}
}

export const nativeImage = {
  createFromPath(_path: string): FakeNativeImage {
    return new FakeNativeImage(false);
  },
  createEmpty(): FakeNativeImage {
    return new FakeNativeImage(true);
  },
};

export const clipboard = {
  writeText(_text: string): void {},
  readText(): string {
    return '';
  },
};

export const shell = {
  openExternal(_url: string): Promise<void> {
    return Promise.resolve();
  },
};

export default {
  app,
  BrowserWindow,
  WebContentsView,
  Tray,
  Menu,
  Notification,
  nativeImage,
  clipboard,
  shell,
  ipcMain,
  ipcRenderer,
  contextBridge,
  session,
};
