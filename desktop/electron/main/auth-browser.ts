import path from 'path';
import {
  app,
  BrowserWindow,
  WebContentsView,
  ipcMain,
  session,
  type Session,
  type WebContents,
} from 'electron';
import { authBubbleSteps, firstRunSlides } from './guide';
import { getPlatformAdapter, type CookieLike } from './platforms/adapters';
import { recordJsonEndpoints } from './platforms/endpoint-recorder';
import {
  fetchPlatformProfile,
  hasLoggedInUserInfo,
} from './platforms/fetch-profile';
import { readPrefs, writePrefs } from './prefs';
import type {
  AgentCookie,
  PlatformAuthProgressPhase,
  PlatformAuthResultPayload,
  PlatformOpenClosedPayload,
} from './protocol';
import {
  CHROME_HEIGHT,
  AUTH_GUIDE_HEIGHT,
  IPC,
  type AnchorRect,
  type GuideBubbleStep,
  type GuideSlide,
} from '@shared/ipc';

export type { AnchorRect } from '@shared/ipc';

const POLL_MS = 1500;
/** 资料探测失败后的最短间隔，避免登录前/资料未就绪时狂打接口 */
const PROFILE_PROBE_COOLDOWN_MS = 3000;

export type AuthResultCallback = (
  result: PlatformAuthResultPayload,
) => void;

export type AuthProgressCallback = (
  phase: PlatformAuthProgressPhase,
) => void;

export type BrowseClosedCallback = (
  payload: PlatformOpenClosedPayload,
) => void;

type GuideMode = 'first-run' | 'bubbles' | null;

export interface AuthBrowserHandle {
  /** 'auth' = one-shot authorization window; 'browse' = creator-center window */
  kind: 'auth' | 'browse';
  requestId: string;
  /** browse mode only: backend platform-account UUID (also the dedupe key) */
  accountId?: string;
  platform: string;
  platformName: string;
  window: BrowserWindow;
  contentView: WebContentsView;
  authSession: Session;
  menuView?: WebContentsView;
  guideView?: WebContentsView;
  toastView?: WebContentsView;
  /** toast overlay finished mounting (safe to send events directly) */
  toastViewReady?: boolean;
  /** events buffered until the toast overlay reports ready */
  pendingToastEvents: Array<{ channel: string; payload?: unknown }>;
  guideMode: GuideMode;
  guideIndex: number;
  /** Measured rect of the toolbar's 「完成授权」 button, window-content px */
  completeAnchor?: AnchorRect;
  /** Last more-menu trigger anchor, window-content px */
  menuAnchor?: { x: number; y: number };
  /** Result callback for THIS job — IPC handlers must use this, never a
   *  closure captured at wiring time (the wiring only happens once). */
  onResult: AuthResultCallback;
  /** Auth jobs only — mirrors progress to the SPA lock dialog. */
  onProgress?: AuthProgressCallback;
  /**
   * 正在抓取/判定登录用户信息；防止轮询与「完成授权」并发。
   * 仅 auth 任务使用。
   */
  authFinishing?: boolean;
  /** 上次自动探测资料的时间戳；用于失败冷却 */
  lastProfileProbeAt?: number;
  dispose: () => Promise<void>;
}

const activeJobs = new Map<
  string,
  AuthBrowserHandle & { pollTimer?: NodeJS.Timeout }
>();
let ipcWired = false;

/**
 * 桌面一体后 Dock 由业务主窗常驻展示；授权/浏览窗开闭不再隐藏 Dock，
 * 避免关授权窗后主产品从 Cmd+Tab 消失。
 */
function updateDockVisibility(): void {
  if (process.platform !== 'darwin' || !app.dock) {
    return;
  }
  void app.dock.show();
}

/** electron-vite output layout: out/{main,preload,renderer} */
function preloadPath(): string {
  return path.join(__dirname, '../preload/index.js');
}

/**
 * Load the auth UI (toolbar / menu / guide) into a WebContents.
 * In dev, electron-vite serves auth.html; in production it's out/renderer/auth.html.
 * @param force 强制整页导航（同文档仅改 hash 时 React 根不会重挂，引导切换必须用）
 */
function loadAuthUi(
  wc: WebContents,
  hash?: string,
  force = false,
): Promise<void> {
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    const base = `${devUrl.replace(/\/$/, '')}/auth.html`;
    // 查询串使 URL 与当前页不同，避免 Chromium 把「仅 hash 变化」当成同文档导航
    const q = force ? `?t=${Date.now()}` : '';
    return wc.loadURL(hash ? `${base}${q}#${hash}` : `${base}${q}`);
  }
  const filePath = path.join(__dirname, '../renderer/auth.html');
  if (force) {
    return wc
      .loadURL('about:blank')
      .then(() => wc.loadFile(filePath, hash ? { hash } : undefined));
  }
  return wc.loadFile(filePath, hash ? { hash } : undefined);
}

function clampZoom(factor: number): number {
  return Math.min(2, Math.max(0.5, Math.round(factor * 10) / 10));
}

/**
 * Keyboard reloads (Cmd/Ctrl+R, Cmd/Ctrl+Shift+R, F5, Ctrl+F5) are blocked
 * on every view: reloading the shell or an overlay leaves the window broken
 * (blank toolbar, stuck guide/menu). The toolbar's reload button is the only
 * sanctioned path, and it reloads just the platform page view.
 */
function blockReloadShortcuts(wc: WebContents): void {
  wc.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') {
      return;
    }
    const key = input.key.toLowerCase();
    if (key === 'f5' || (key === 'r' && (input.control || input.meta))) {
      event.preventDefault();
    }
  });
}

async function collectCookies(
  authSession: Session,
  domains: string[],
): Promise<AgentCookie[]> {
  const all = await authSession.cookies.get({});
  const matched = all.filter((cookie) => {
    const domain = cookie.domain ?? '';
    return domains.some(
      (d) =>
        domain === d ||
        domain.endsWith(d.replace(/^\./, '')) ||
        domain.includes(d.replace(/^\./, '')),
    );
  });
  const source = matched.length > 0 ? matched : all;
  return source.map((cookie) => ({
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    expirationDate: cookie.expirationDate,
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
  }));
}

function findJobByWebContents(
  sender: Electron.WebContents,
): (AuthBrowserHandle & { pollTimer?: NodeJS.Timeout }) | undefined {
  return [...activeJobs.values()].find(
    (j) =>
      j.window.webContents === sender ||
      j.contentView.webContents === sender ||
      j.menuView?.webContents === sender ||
      j.guideView?.webContents === sender ||
      j.toastView?.webContents === sender,
  );
}

function pushState(handle: AuthBrowserHandle): void {
  const wc = handle.contentView.webContents;
  const state = {
    url: wc.getURL(),
    title: wc.getTitle(),
    canGoBack: wc.navigationHistory?.canGoBack?.() ?? wc.canGoBack(),
    canGoForward: wc.navigationHistory?.canGoForward?.() ?? wc.canGoForward(),
    zoomFactor: wc.getZoomFactor(),
    kind: handle.kind,
  };
  if (!handle.window.isDestroyed()) {
    handle.window.webContents.send(IPC.state, state);
  }
  if (handle.menuView && !handle.menuView.webContents.isDestroyed()) {
    handle.menuView.webContents.send(IPC.state, state);
  }
}

function pushGuide(handle: AuthBrowserHandle): void {
  if (!handle.guideView || handle.guideView.webContents.isDestroyed()) {
    return;
  }
  if (handle.guideMode === 'first-run') {
    const slides: GuideSlide[] = firstRunSlides(handle.platformName);
    handle.guideView.webContents.send(IPC.guide, {
      kind: 'first-run',
      platformName: handle.platformName,
      slideIndex: handle.guideIndex,
      slides,
    });
    return;
  }
  if (handle.guideMode === 'bubbles') {
    const steps: GuideBubbleStep[] = authBubbleSteps(handle.platformName);
    handle.guideView.webContents.send(IPC.guide, {
      kind: 'bubbles',
      platformName: handle.platformName,
      stepIndex: handle.guideIndex,
      steps,
      completeAnchor: handle.completeAnchor ?? null,
    });
  }
}

function layoutContent(handle: AuthBrowserHandle): void {
  const [width, height] = handle.window.getContentSize();
  const top =
    CHROME_HEIGHT + (handle.guideMode === 'bubbles' ? AUTH_GUIDE_HEIGHT : 0);
  handle.contentView.setBounds({
    x: 0,
    y: top,
    width,
    height: Math.max(0, height - top),
  });
}

function layoutGuide(handle: AuthBrowserHandle): void {
  if (!handle.guideView || handle.guideMode === null) {
    return;
  }
  const [w, h] = handle.window.getContentSize();
  // Only the first-use introduction is modal. The hint occupies its own row;
  // a transparent full-window view would still intercept platform clicks.
  handle.guideView.setBounds(
    handle.guideMode === 'bubbles'
      ? { x: 0, y: CHROME_HEIGHT, width: w, height: AUTH_GUIDE_HEIGHT }
      : { x: 0, y: 0, width: w, height: h },
  );
}

function closeMoreMenu(handle: AuthBrowserHandle): void {
  if (!handle.menuView) {
    return;
  }
  handle.menuView.setVisible(false);
}

function ensureMenuView(handle: AuthBrowserHandle): WebContentsView {
  if (handle.menuView) {
    return handle.menuView;
  }

  const menuView = new WebContentsView({
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  menuView.setBackgroundColor('#00000000');
  menuView.setVisible(false);
  blockReloadShortcuts(menuView.webContents);

  menuView.webContents.on('blur', () => {
    closeMoreMenu(handle);
  });

  void loadAuthUi(menuView.webContents, 'more-menu');

  handle.menuView = menuView;
  handle.window.contentView.addChildView(menuView);
  return menuView;
}

function openMoreMenu(
  handle: AuthBrowserHandle,
  anchor: { x: number; y: number },
): void {
  const menuView = ensureMenuView(handle);
  const [winW, winH] = handle.window.getContentSize();
  // Modal overlay: cover the whole window. The renderer positions the card
  // next to the anchor and closes the menu on outside click / Escape, so
  // occlusion is intentional (native menus behave the same way).
  handle.menuAnchor = anchor;
  menuView.setBounds({ x: 0, y: 0, width: winW, height: winH });
  handle.window.contentView.addChildView(menuView);
  menuView.setVisible(true);
  if (!menuView.webContents.isDestroyed()) {
    menuView.webContents.send(IPC.menuAnchor, anchor);
  }
  menuView.webContents.focus();
  pushState(handle);
}

function disposeMenuView(handle: AuthBrowserHandle): void {
  if (!handle.menuView) {
    return;
  }
  const menuView = handle.menuView;
  handle.menuView = undefined;
  if (!menuView.webContents.isDestroyed()) {
    menuView.webContents.close();
  }
}

function ensureGuideView(handle: AuthBrowserHandle): WebContentsView {
  if (handle.guideView) {
    return handle.guideView;
  }
  const guideView = new WebContentsView({
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  guideView.setBackgroundColor('#00000000');
  guideView.setVisible(false);
  blockReloadShortcuts(guideView.webContents);
  handle.guideView = guideView;
  handle.window.contentView.addChildView(guideView);
  return guideView;
}

async function loadGuideHash(
  guideView: WebContentsView,
  hash: string,
): Promise<void> {
  // 引导模式切换（first-run → bubbles）必须整页重载：仅改 hash 时
  // App 若未收到 hashchange，会一直停在「开始授权」页，点击像无响应。
  await loadAuthUi(guideView.webContents, hash, true);
}

function hideGuide(handle: AuthBrowserHandle): void {
  handle.guideMode = null;
  handle.guideIndex = 0;
  if (handle.guideView) {
    handle.guideView.setVisible(false);
  }
  if (!handle.window.isDestroyed()) {
    layoutContent(handle);
    handle.contentView.webContents.focus();
  }
}

async function showFirstRunGuide(handle: AuthBrowserHandle): Promise<void> {
  if (handle.kind !== 'auth') {
    // Guides walk the AUTH flow (step 2 anchors to 「完成授权」, which
    // browse windows don't render) — never show them elsewhere.
    return;
  }
  closeMoreMenu(handle);
  const guideView = ensureGuideView(handle);
  handle.guideMode = 'first-run';
  handle.guideIndex = 0;
  await loadGuideHash(guideView, 'guide-first');
  if (!activeJobs.has(handle.requestId) || handle.guideMode !== 'first-run') {
    return;
  }
  layoutContent(handle);
  layoutGuide(handle);
  handle.window.contentView.addChildView(guideView);
  guideView.setVisible(true);
  guideView.webContents.focus();
  pushGuide(handle);
}

async function showStepBubbles(
  handle: AuthBrowserHandle,
  startIndex = 0,
): Promise<void> {
  if (handle.kind !== 'auth') {
    // See showFirstRunGuide — auth-flow guides don't apply to browse windows.
    return;
  }
  closeMoreMenu(handle);
  const guideView = ensureGuideView(handle);
  const steps = authBubbleSteps(handle.platformName);
  handle.guideMode = 'bubbles';
  handle.guideIndex = Math.max(0, Math.min(startIndex, steps.length - 1));
  await loadGuideHash(guideView, 'guide-bubble');
  if (!activeJobs.has(handle.requestId) || handle.guideMode !== 'bubbles') {
    return;
  }
  layoutContent(handle);
  layoutGuide(handle);
  handle.window.contentView.addChildView(guideView);
  guideView.setVisible(true);
  pushGuide(handle);
}

async function maybeStartGuides(handle: AuthBrowserHandle): Promise<void> {
  const prefs = readPrefs();
  if (!prefs.firstRunGuideSeen) {
    await showFirstRunGuide(handle);
    return;
  }
  if (!prefs.stepBubblesDismissed) {
    await showStepBubbles(handle, 0);
  }
}

async function finishFirstRun(
  handle: AuthBrowserHandle,
  thenBubbles: boolean,
): Promise<void> {
  writePrefs({ firstRunGuideSeen: true });
  hideGuide(handle);
  if (thenBubbles && !readPrefs().stepBubblesDismissed) {
    await showStepBubbles(handle, 0);
  }
}

function disposeGuideView(handle: AuthBrowserHandle): void {
  if (!handle.guideView) {
    return;
  }
  const guideView = handle.guideView;
  handle.guideView = undefined;
  handle.guideMode = null;
  if (!guideView.webContents.isDestroyed()) {
    guideView.webContents.close();
  }
}

/** card 356 + 2×16 margins */
const TOAST_VIEW_WIDTH = 388;
/** room for the 3-toast stack limit */
const TOAST_VIEW_HEIGHT = 260;

function layoutToastView(handle: AuthBrowserHandle): void {
  if (!handle.toastView) {
    return;
  }
  const [w] = handle.window.getContentSize();
  // Top-right, just below the toolbar chrome.
  handle.toastView.setBounds({
    x: Math.max(0, w - TOAST_VIEW_WIDTH),
    y: CHROME_HEIGHT,
    width: TOAST_VIEW_WIDTH,
    height: TOAST_VIEW_HEIGHT,
  });
}

/**
 * Created eagerly with the window so it's loaded before the first event.
 * Kept hidden while empty: even a fully transparent view swallows clicks
 * in its bounds, and this one sits over the page's top-right corner.
 */
function ensureToastView(handle: AuthBrowserHandle): WebContentsView {
  if (handle.toastView) {
    return handle.toastView;
  }
  const toastView = new WebContentsView({
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  toastView.setBackgroundColor('#00000000');
  toastView.setVisible(false);
  blockReloadShortcuts(toastView.webContents);
  handle.toastView = toastView;
  handle.window.contentView.addChildView(toastView);
  layoutToastView(handle);
  void loadAuthUi(toastView.webContents, 'toasts');
  if (process.env['PUGYING_DEBUG_TOASTS']) {
    toastView.webContents.openDevTools({ mode: 'detach' });
    toastView.webContents.on('console-message', (_e, _level, message) => {
      console.log('[toast-view console]', message);
    });
    toastView.webContents.on(
      'did-fail-load',
      (_e, code, desc) => console.log('[toast-view] load failed', code, desc),
    );
  }
  return toastView;
}

/** Deliver an event to the toast overlay, buffering until it's mounted. */
export function sendToastEvent(
  handle: AuthBrowserHandle,
  channel: string,
  payload?: unknown,
): void {
  ensureToastView(handle);
  if (process.env['PUGYING_DEBUG_TOASTS']) {
    console.log(
      '[toast] event',
      channel,
      handle.toastViewReady ? 'sent' : 'queued',
    );
  }
  if (!handle.toastViewReady) {
    handle.pendingToastEvents.push({ channel, payload });
    return;
  }
  if (handle.toastView && !handle.toastView.webContents.isDestroyed()) {
    handle.toastView.webContents.send(channel, payload);
  }
}

function disposeToastView(handle: AuthBrowserHandle): void {
  if (!handle.toastView) {
    return;
  }
  const toastView = handle.toastView;
  handle.toastView = undefined;
  handle.toastViewReady = false;
  handle.pendingToastEvents = [];
  if (!toastView.webContents.isDestroyed()) {
    toastView.webContents.close();
  }
}

function wireIpcOnce(): void {
  if (ipcWired) {
    return;
  }
  ipcWired = true;

  const withJob = async (
    event: Electron.IpcMainInvokeEvent,
    fn: (handle: AuthBrowserHandle) => Promise<unknown> | unknown,
  ) => {
    const handle = findJobByWebContents(event.sender);
    if (!handle) {
      return;
    }
    return fn(handle);
  };

  ipcMain.handle(IPC.back, (event) =>
    withJob(event, (handle) => {
      const wc = handle.contentView.webContents;
      if (wc.canGoBack()) {
        wc.goBack();
      }
    }),
  );
  ipcMain.handle(IPC.forward, (event) =>
    withJob(event, (handle) => {
      const wc = handle.contentView.webContents;
      if (wc.canGoForward()) {
        wc.goForward();
      }
    }),
  );
  ipcMain.handle(IPC.reload, (event, hard: boolean) =>
    withJob(event, (handle) => {
      const wc = handle.contentView.webContents;
      if (hard) {
        wc.reloadIgnoringCache();
      } else {
        wc.reload();
      }
    }),
  );
  // Invoked by the TOOLBAR view: the invoke's promise settles when the work
  // below finishes (or throws), driving its loading/success/error toast.
  ipcMain.handle(IPC.clearCache, (event) =>
    withJob(event, async (handle) => {
      await handle.authSession.clearCache();
      // Electron 44 起 storages 不再包含 websql（WebSQL 已移除）
      await handle.authSession.clearStorageData({
        storages: [
          'filesystem',
          'indexdb',
          'localstorage',
          'shadercache',
          'serviceworkers',
          'cachestorage',
        ],
      });
    }),
  );
  // Invoked by the MENU view: hand the flow to the toast overlay (which owns
  // the toast surface) and get the menu out of the way.
  ipcMain.handle(IPC.clearCacheRequest, (event) =>
    withJob(event, (handle) => {
      closeMoreMenu(handle);
      sendToastEvent(handle, IPC.clearCacheRun);
    }),
  );
  ipcMain.handle(IPC.toastReady, (event) =>
    withJob(event, (handle) => {
      handle.toastViewReady = true;
      if (process.env['PUGYING_DEBUG_TOASTS']) {
        console.log(
          '[toast] ready, flushing',
          handle.pendingToastEvents.length,
        );
      }
      const pending = handle.pendingToastEvents.splice(0);
      for (const { channel, payload } of pending) {
        if (handle.toastView && !handle.toastView.webContents.isDestroyed()) {
          handle.toastView.webContents.send(channel, payload);
        }
      }
    }),
  );
  ipcMain.handle(IPC.toastState, (event, active?: boolean) =>
    withJob(event, (handle) => {
      const toastView = handle.toastView;
      if (process.env['PUGYING_DEBUG_TOASTS']) {
        console.log('[toast] state', active, 'view?', Boolean(toastView));
      }
      if (!toastView) {
        return;
      }
      if (active === true) {
        layoutToastView(handle);
        // re-add to raise above the platform page view
        handle.window.contentView.addChildView(toastView);
        toastView.setVisible(true);
        // 引导层须压在 toast 之上，否则透明 toast 区域会吞掉「开始授权」点击
        if (handle.guideView && handle.guideMode !== null) {
          handle.window.contentView.addChildView(handle.guideView);
        }
      } else {
        toastView.setVisible(false);
      }
    }),
  );
  ipcMain.handle(IPC.zoomIn, (event) =>
    withJob(event, (handle) => {
      const wc = handle.contentView.webContents;
      wc.setZoomFactor(clampZoom(wc.getZoomFactor() + 0.1));
      pushState(handle);
    }),
  );
  ipcMain.handle(IPC.zoomOut, (event) =>
    withJob(event, (handle) => {
      const wc = handle.contentView.webContents;
      wc.setZoomFactor(clampZoom(wc.getZoomFactor() - 0.1));
      pushState(handle);
    }),
  );
  ipcMain.handle(IPC.zoomReset, (event) =>
    withJob(event, (handle) => {
      handle.contentView.webContents.setZoomFactor(1);
      pushState(handle);
    }),
  );
  ipcMain.handle(
    IPC.moreMenu,
    (event, anchor?: { x?: number; y?: number }) =>
      withJob(event, (handle) => {
        openMoreMenu(handle, {
          x: typeof anchor?.x === 'number' ? anchor.x : 0,
          y: typeof anchor?.y === 'number' ? anchor.y : CHROME_HEIGHT,
        });
      }),
  );
  ipcMain.handle(IPC.moreMenuClose, (event) =>
    withJob(event, (handle) => {
      closeMoreMenu(handle);
    }),
  );
  // First open races the overlay's initial load: the anchor push can fire
  // before React mounts its listener. The renderer calls this once mounted
  // and we re-send the latest anchor.
  ipcMain.handle(IPC.menuReady, (event) =>
    withJob(event, (handle) => {
      if (
        handle.menuAnchor &&
        handle.menuView &&
        !handle.menuView.webContents.isDestroyed()
      ) {
        handle.menuView.webContents.send(IPC.menuAnchor, handle.menuAnchor);
      }
    }),
  );

  ipcMain.handle(IPC.guideFirstNext, (event) =>
    withJob(event, async (handle) => {
      if (handle.guideMode !== 'first-run') {
        return;
      }
      const slides = firstRunSlides(handle.platformName);
      if (handle.guideIndex < slides.length - 1) {
        handle.guideIndex += 1;
        pushGuide(handle);
        return;
      }
      // 末页误走 next 时也结束指引，避免「开始授权」看起来无响应
      await finishFirstRun(handle, true);
    }),
  );
  ipcMain.handle(IPC.guideFirstSkip, (event) =>
    withJob(event, async (handle) => {
      await finishFirstRun(handle, false);
    }),
  );
  ipcMain.handle(IPC.guideFirstFinish, (event) =>
    withJob(event, async (handle) => {
      await finishFirstRun(handle, true);
    }),
  );
  ipcMain.handle(IPC.guideBubbleNext, (event) =>
    withJob(event, (handle) => {
      if (handle.guideMode !== 'bubbles') {
        return;
      }
      const steps = authBubbleSteps(handle.platformName);
      if (handle.guideIndex < steps.length - 1) {
        handle.guideIndex += 1;
        layoutGuide(handle);
        pushGuide(handle);
      } else {
        hideGuide(handle);
      }
    }),
  );
  ipcMain.handle(IPC.guideBubbleClose, (event) =>
    withJob(event, (handle) => {
      hideGuide(handle);
    }),
  );
  ipcMain.handle(IPC.guideBubbleDismissForever, (event) =>
    withJob(event, (handle) => {
      writePrefs({ stepBubblesDismissed: true });
      hideGuide(handle);
    }),
  );
  ipcMain.handle(IPC.guideShowBubbles, (event) =>
    withJob(event, async (handle) => {
      await showStepBubbles(handle, 0);
    }),
  );
  ipcMain.handle(IPC.guideReady, (event) =>
    withJob(event, (handle) => {
      layoutGuide(handle);
      pushGuide(handle);
    }),
  );
  ipcMain.handle(
    IPC.completeAnchor,
    (event, rect?: Partial<AnchorRect>) =>
      withJob(event, (handle) => {
        if (
          typeof rect?.x !== 'number' ||
          typeof rect?.y !== 'number' ||
          typeof rect?.width !== 'number' ||
          typeof rect?.height !== 'number'
        ) {
          return;
        }
        const next: AnchorRect = {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        };
        const prev = handle.completeAnchor;
        if (
          prev &&
          prev.x === next.x &&
          prev.y === next.y &&
          prev.width === next.width &&
          prev.height === next.height
        ) {
          return;
        }
        handle.completeAnchor = next;
        if (handle.guideMode === 'bubbles') {
          layoutGuide(handle);
          pushGuide(handle);
        }
      }),
  );

  ipcMain.handle(IPC.complete, (event) =>
    withJob(event, async (handle) => {
      if (handle.kind !== 'auth') {
        return;
      }
      await finishAuth(handle, 'manual');
    }),
  );
  ipcMain.handle(IPC.cancel, (event) =>
    withJob(event, async (handle) => {
      if (handle.kind === 'browse') {
        // Browse windows have no cancel semantics — treat as a normal close
        // so the cookie write-back path still runs.
        if (!handle.window.isDestroyed()) {
          handle.window.close();
        }
        return;
      }
      handle.onResult({
        requestId: handle.requestId,
        ok: false,
        error: 'cancelled',
        platform: handle.platform,
      });
      await disposeAuthJob(handle.requestId);
    }),
  );
}

/**
 * 完成授权：唯一成功条件是读到 platformUserId + nickname。
 * isAuthed 只决定「值得探测」，不能单独视为登录成功。
 */
async function finishAuth(
  handle: AuthBrowserHandle,
  source: 'auto' | 'manual',
): Promise<void> {
  if (handle.kind !== 'auth') {
    return;
  }
  if (handle.authFinishing) {
    return;
  }
  // 自动探测失败后冷却，避免 1.5s 轮询打爆资料接口；手动点击不冷却
  if (
    source === 'auto' &&
    handle.lastProfileProbeAt &&
    Date.now() - handle.lastProfileProbeAt < PROFILE_PROBE_COOLDOWN_MS
  ) {
    return;
  }

  handle.authFinishing = true;
  // 仅手动点「完成授权」时推进主窗进度，避免自动探测失败导致文案闪烁
  if (source === 'manual') {
    handle.onProgress?.('finishing');
  }
  try {
    const adapter = getPlatformAdapter(handle.platform);
    if (!adapter) {
      if (source === 'manual') {
        // 不经 notify.ts，避免与本文件 sendToastEvent 循环依赖
        sendToastEvent(handle, IPC.notice, {
          text: '还没有确认登录成功，请先完成登录后再试',
          type: 'error',
        });
        handle.onProgress?.('awaiting_login');
      }
      return;
    }

    const cookies = await collectCookies(
      handle.authSession,
      adapter.cookieDomains,
    );
    const profile = await fetchPlatformProfile({
      adapter,
      authSession: handle.authSession,
      cookies: cookies as CookieLike[],
      webContents: handle.contentView.webContents,
    });

    if (!hasLoggedInUserInfo(profile)) {
      handle.lastProfileProbeAt = Date.now();
      if (source === 'manual') {
        sendToastEvent(handle, IPC.notice, {
          text: '还没有确认登录成功，请先完成登录后再试',
          type: 'error',
        });
        handle.onProgress?.('awaiting_login');
      }
      return;
    }

    handle.onProgress?.('finishing');
    handle.onResult({
      requestId: handle.requestId,
      ok: true,
      platform: handle.platform,
      cookies,
      finalUrl: handle.contentView.webContents.getURL(),
      source,
      profile: profile ?? undefined,
    });
    await disposeAuthJob(handle.requestId);
  } finally {
    // dispose 后 handle 可能已从 map 移除；仍清锁以便未成功路径可重试
    handle.authFinishing = false;
  }
}

export function startAuthBrowser(options: {
  requestId: string;
  platform: string;
  loginUrl?: string;
  onResult: AuthResultCallback;
  onProgress?: AuthProgressCallback;
}): AuthBrowserHandle | { error: string } {
  const adapter = getPlatformAdapter(options.platform);
  if (!adapter) {
    return { error: `unsupported_platform:${options.platform}` };
  }

  if (activeJobs.has(options.requestId)) {
    return { error: 'duplicate_request_id' };
  }

  wireIpcOnce();

  const partition = `temp:auth-${options.requestId}`;
  const authSession = session.fromPartition(partition, { cache: false });
  // Start before the page loads so we catch its very first profile calls.
  recordJsonEndpoints(authSession, adapter.cookieDomains);
  const loginUrl = options.loginUrl?.trim() || adapter.loginUrl;

  const window = new BrowserWindow({
    width: 1200,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    title: `${adapter.displayName} 授权`,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const contentView = new WebContentsView({
    webPreferences: {
      session: authSession,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  blockReloadShortcuts(window.webContents);
  blockReloadShortcuts(contentView.webContents);
  window.contentView.addChildView(contentView);

  const handle: AuthBrowserHandle & { pollTimer?: NodeJS.Timeout } = {
    kind: 'auth',
    requestId: options.requestId,
    platform: options.platform,
    platformName: adapter.displayName,
    window,
    contentView,
    authSession,
    guideMode: null,
    guideIndex: 0,
    pendingToastEvents: [],
    onResult: options.onResult,
    onProgress: options.onProgress,
    dispose: async () => {
      if (handle.pollTimer) {
        clearInterval(handle.pollTimer);
        handle.pollTimer = undefined;
      }
      disposeMenuView(handle);
      disposeGuideView(handle);
      disposeToastView(handle);
      if (!contentView.webContents.isDestroyed()) {
        contentView.webContents.close();
      }
      if (!window.isDestroyed()) {
        window.destroy();
      }
      await authSession.clearStorageData();
      await authSession.clearCache();
    },
  };

  activeJobs.set(options.requestId, handle);
  updateDockVisibility();
  layoutContent(handle);
  ensureToastView(handle);
  options.onProgress?.('window_opened');

  window.on('resize', () => {
    layoutContent(handle);
    closeMoreMenu(handle);
    layoutGuide(handle);
    pushGuide(handle);
    layoutToastView(handle);
  });
  window.on('closed', () => {
    if (activeJobs.has(options.requestId)) {
      options.onResult({
        requestId: options.requestId,
        ok: false,
        error: 'window_closed',
        platform: options.platform,
      });
      void disposeAuthJob(options.requestId);
    }
  });

  const wc = contentView.webContents;
  const sync = () => pushState(handle);
  let announcedAwaitingLogin = false;
  const announceAwaitingLogin = () => {
    if (announcedAwaitingLogin || !activeJobs.has(options.requestId)) {
      return;
    }
    announcedAwaitingLogin = true;
    options.onProgress?.('awaiting_login');
  };
  wc.on('did-navigate', sync);
  wc.on('did-navigate-in-page', sync);
  wc.on('did-finish-load', () => {
    sync();
    announceAwaitingLogin();
  });
  wc.on('page-title-updated', sync);
  wc.setWindowOpenHandler(({ url }) => {
    void wc.loadURL(url);
    return { action: 'deny' };
  });

  handle.pollTimer = setInterval(() => {
    void (async () => {
      if (!activeJobs.has(options.requestId)) {
        return;
      }
      const url = wc.getURL();
      const cookies = await collectCookies(authSession, adapter.cookieDomains);
      // isAuthed = 大致已在登录后界面，值得探测资料；成功与否只看用户信息
      if (adapter.isAuthed(cookies as CookieLike[], url)) {
        await finishAuth(handle, 'auto');
      }
    })();
  }, POLL_MS);

  void loadAuthUi(window.webContents).then(async () => {
    if (!activeJobs.has(handle.requestId)) {
      return;
    }
    pushState(handle);
    await maybeStartGuides(handle);
  });
  void wc.loadURL(loginUrl).then(
    () => {
      announceAwaitingLogin();
    },
    () => {
      // Still ask the user to log in even if the first navigation fails —
      // they can refresh from the chrome toolbar.
      announceAwaitingLogin();
    },
  );

  return handle;
}

function browseJobKey(accountId: string): string {
  return `open:${accountId}`;
}

function normalizeSameSite(
  value: string | undefined,
): 'unspecified' | 'no_restriction' | 'lax' | 'strict' | undefined {
  if (
    value === 'unspecified' ||
    value === 'no_restriction' ||
    value === 'lax' ||
    value === 'strict'
  ) {
    return value;
  }
  return undefined;
}

/**
 * Replace the partition's cookies with the backend-issued snapshot. The
 * backend copy is authoritative: every window close writes refreshed
 * cookies back, so seeding from it can only move the session forward.
 */
export async function injectCookies(
  browseSession: Session,
  cookies: AgentCookie[],
): Promise<void> {
  await browseSession.clearStorageData({ storages: ['cookies'] });
  for (const cookie of cookies) {
    const domain = cookie.domain ?? '';
    const host = domain.replace(/^\./, '');
    if (!host || !cookie.name) {
      continue;
    }
    const sameSite = normalizeSameSite(cookie.sameSite);
    // Chromium rejects SameSite=None cookies that aren't Secure.
    const secure =
      sameSite === 'no_restriction' ? true : (cookie.secure ?? false);
    const details: Electron.CookiesSetDetails = {
      url: `https://${host}${cookie.path ?? '/'}`,
      name: cookie.name,
      value: cookie.value,
      path: cookie.path ?? '/',
      secure,
      httpOnly: cookie.httpOnly ?? false,
    };
    if (domain.startsWith('.')) {
      details.domain = domain;
    }
    if (typeof cookie.expirationDate === 'number') {
      details.expirationDate = cookie.expirationDate;
    }
    if (sameSite) {
      details.sameSite = sameSite;
    }
    try {
      await browseSession.cookies.set(details);
    } catch (error) {
      // 单条失败不阻断；关键会话 cookie 若被拒会导致「打开仍未登录」
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(
        `[pugying-desktop] cookie inject skipped ${cookie.name}@${domain}: ${reason}`,
      );
    }
  }
}

/**
 * Open (or focus) a creator-center window for an already-bound account.
 *
 * - One window per account: a second request focuses the existing window.
 *   Different accounts open independent windows side by side.
 * - Session partition is `persist:account-<id>` — isolated per account, so
 *   two accounts of the same platform never share a login.
 * - On close, refreshed cookies are collected and handed to `onClosed` for
 *   the frontend to write back to the backend.
 */
export async function startCreatorBrowser(options: {
  requestId: string;
  accountId: string;
  platform: string;
  displayName?: string;
  url?: string;
  cookies: AgentCookie[];
  onClosed: BrowseClosedCallback;
}): Promise<{ status: 'opened' | 'focused' } | { error: string }> {
  const adapter = getPlatformAdapter(options.platform);
  if (!adapter) {
    return { error: `unsupported_platform:${options.platform}` };
  }
  if (options.cookies.length === 0) {
    return { error: 'missing_cookies' };
  }

  const jobKey = browseJobKey(options.accountId);
  const existing = activeJobs.get(jobKey);
  if (existing) {
    if (!existing.window.isDestroyed()) {
      if (existing.window.isMinimized()) {
        existing.window.restore();
      }
      existing.window.show();
      existing.window.focus();
      return { status: 'focused' };
    }
    activeJobs.delete(jobKey);
  }

  wireIpcOnce();

  const browseSession = session.fromPartition(
    `persist:account-${options.accountId}`,
  );
  // Lets the on-close profile refresh replay whatever the page called.
  recordJsonEndpoints(browseSession, adapter.cookieDomains);
  await injectCookies(browseSession, options.cookies);

  // 视频号等：调用方应传 homeUrl；缺省勿回落到 login.html
  const openUrl =
    options.url?.trim() || adapter.homeUrl || adapter.loginUrl;
  const accountLabel = options.displayName?.trim() || adapter.displayName;

  const window = new BrowserWindow({
    width: 1200,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    title: `${accountLabel} · ${adapter.displayName}创作者中心`,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // Keep the account label as the window title; the auth UI and content
  // pages must not overwrite it (it's how users tell windows apart).
  window.on('page-title-updated', (event) => {
    event.preventDefault();
  });

  const contentView = new WebContentsView({
    webPreferences: {
      session: browseSession,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  blockReloadShortcuts(window.webContents);
  blockReloadShortcuts(contentView.webContents);
  window.contentView.addChildView(contentView);

  const handle: AuthBrowserHandle & { pollTimer?: NodeJS.Timeout } = {
    kind: 'browse',
    requestId: options.requestId,
    accountId: options.accountId,
    platform: options.platform,
    platformName: adapter.displayName,
    window,
    contentView,
    authSession: browseSession,
    guideMode: null,
    guideIndex: 0,
    pendingToastEvents: [],
    // Browse jobs report via onClosed; onResult exists only to satisfy the
    // shared handle shape used by the IPC dispatch.
    onResult: () => undefined,
    dispose: async () => {
      disposeMenuView(handle);
      disposeGuideView(handle);
      disposeToastView(handle);
      if (!contentView.webContents.isDestroyed()) {
        contentView.webContents.close();
      }
      if (!window.isDestroyed()) {
        window.destroy();
      }
      // Persistent partition: keep storage so the next open stays warm.
    },
  };

  activeJobs.set(jobKey, handle);
  updateDockVisibility();
  layoutContent(handle);
  ensureToastView(handle);

  window.on('resize', () => {
    layoutContent(handle);
    closeMoreMenu(handle);
    layoutToastView(handle);
  });

  let lastUrl = openUrl;
  window.on('close', () => {
    const wc = contentView.webContents;
    if (!wc.isDestroyed()) {
      lastUrl = wc.getURL() || lastUrl;
    }
  });
  window.on('closed', () => {
    if (!activeJobs.has(jobKey)) {
      return;
    }
    activeJobs.delete(jobKey);
    updateDockVisibility();
    void (async () => {
      // The session outlives the window, so refreshed cookies are still
      // collectable here for the write-back.
      const cookies = await collectCookies(browseSession, adapter.cookieDomains);
      // Also refresh the profile so platform-side renames / avatar changes
      // propagate back on close. The content view is gone by now, so this
      // is API-only (no DOM scrape).
      const profile = await fetchPlatformProfile({
        adapter,
        authSession: browseSession,
        cookies: cookies as CookieLike[],
      });
      options.onClosed({
        accountId: options.accountId,
        platform: options.platform,
        cookies,
        finalUrl: lastUrl,
        profile: profile ?? undefined,
      });
      disposeMenuView(handle);
      disposeToastView(handle);
      if (!contentView.webContents.isDestroyed()) {
        contentView.webContents.close();
      }
    })();
  });

  const wc = contentView.webContents;
  const sync = () => pushState(handle);
  wc.on('did-navigate', sync);
  wc.on('did-navigate-in-page', sync);
  wc.on('did-finish-load', sync);
  wc.on('page-title-updated', sync);
  wc.setWindowOpenHandler(({ url }) => {
    void wc.loadURL(url);
    return { action: 'deny' };
  });

  void loadAuthUi(window.webContents, 'browse').then(() => {
    pushState(handle);
  });
  void wc.loadURL(openUrl);

  return { status: 'opened' };
}

export async function disposeAuthJob(requestId: string): Promise<void> {
  const handle = activeJobs.get(requestId);
  if (!handle) {
    return;
  }
  activeJobs.delete(requestId);
  updateDockVisibility();
  await handle.dispose();
}

export async function disposeAllAuthJobs(): Promise<void> {
  const ids = [...activeJobs.entries()]
    .filter(([, job]) => job.kind === 'auth')
    .map(([id]) => id);
  for (const id of ids) {
    await disposeAuthJob(id);
  }
}

export function getActiveAuthJobCount(): number {
  return [...activeJobs.values()].filter((job) => job.kind === 'auth').length;
}

export function getActiveBrowseWindowCount(): number {
  return [...activeJobs.values()].filter((job) => job.kind === 'browse').length;
}

/** Gracefully close all creator-center windows (runs the write-back path). */
export function closeAllBrowseWindows(): number {
  const jobs = [...activeJobs.values()].filter((job) => job.kind === 'browse');
  for (const job of jobs) {
    if (!job.window.isDestroyed()) {
      job.window.close();
    }
  }
  return jobs.length;
}

export async function cancelAuthJob(
  requestId: string,
  onResult: AuthResultCallback,
): Promise<boolean> {
  const handle = activeJobs.get(requestId);
  if (!handle) {
    return false;
  }
  onResult({
    requestId,
    ok: false,
    error: 'cancelled',
    platform: handle.platform,
  });
  await disposeAuthJob(requestId);
  return true;
}
