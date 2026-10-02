import { ipcMain } from 'electron';
import {
  startAuthBrowser,
  disposeAuthJob,
  type AuthBrowserHandle,
} from './auth-browser';
import { readPrefs, writePrefs } from './prefs';
import { AUTH_GUIDE_HEIGHT, CHROME_HEIGHT, IPC } from '@shared/ipc';

vi.mock('./prefs', () => {
  let prefs = { firstRunGuideSeen: false, stepBubblesDismissed: false };
  return {
    readPrefs: () => ({ ...prefs }),
    writePrefs: (patch: Partial<typeof prefs>) => {
      prefs = { ...prefs, ...patch };
      return { ...prefs };
    },
  };
});

type Handler = (event: { sender: unknown }) => unknown;
const handlers = new Map<string, Handler>();
let handle: AuthBrowserHandle;
let requestIndex = 0;

async function invoke(channel: string): Promise<void> {
  const handler = handlers.get(channel);
  if (!handler) {
    throw new Error(`Missing handler: ${channel}`);
  }
  await handler({ sender: handle.window.webContents });
}

async function openAuth(): Promise<void> {
  const result = startAuthBrowser({
    requestId: `guide-flow-${++requestIndex}`,
    platform: 'toutiao',
    onResult: () => undefined,
  });
  if ('error' in result) {
    throw new Error(result.error);
  }
  handle = result;
  await vi.waitFor(() => {
    if (!readPrefs().firstRunGuideSeen || !readPrefs().stepBubblesDismissed) {
      expect(handle.guideView?.getVisible()).toBe(true);
    }
  });
  // Let the initial toolbar load finish even when no guide is expected.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

beforeAll(() => {
  vi.spyOn(ipcMain, 'handle').mockImplementation((channel, listener) => {
    handlers.set(channel, listener as Handler);
  });
});

beforeEach(() => {
  writePrefs({ firstRunGuideSeen: false, stepBubblesDismissed: false });
});

afterEach(async () => {
  if (handle) {
    await disposeAuthJob(handle.requestId);
  }
});

afterAll(() => {
  vi.restoreAllMocks();
});

it('starts with one modal introduction, then reserves a separate row for the login hint', async () => {
  await openAuth();
  expect(handle.guideMode).toBe('first-run');
  expect(handle.guideView?.getBounds()).toEqual({
    x: 0,
    y: 0,
    width: 1200,
    height: 860,
  });

  await invoke(IPC.guideFirstFinish);
  expect(readPrefs().firstRunGuideSeen).toBe(true);
  expect(handle.guideMode).toBe('bubbles');
  expect(handle.guideView?.getBounds()).toEqual({
    x: 0,
    y: CHROME_HEIGHT,
    width: 1200,
    height: AUTH_GUIDE_HEIGHT,
  });
  expect(handle.contentView.getBounds().y).toBe(
    CHROME_HEIGHT + AUTH_GUIDE_HEIGHT,
  );

  handle.window.emit('resize');
  expect(handle.contentView.getBounds().y).toBe(
    handle.guideView!.getBounds().y + handle.guideView!.getBounds().height,
  );

  await invoke(IPC.guideBubbleClose);
  expect(handle.guideView?.getVisible()).toBe(false);
  expect(handle.contentView.getBounds()).toEqual({
    x: 0,
    y: CHROME_HEIGHT,
    width: 1200,
    height: 812,
  });
  expect(readPrefs().stepBubblesDismissed).toBe(false);
});

it('skip immediately exposes the login page and still allows opening help manually', async () => {
  await openAuth();
  await invoke(IPC.guideFirstSkip);
  expect(handle.guideMode).toBe(null);
  expect(handle.guideView?.getVisible()).toBe(false);
  expect(handle.contentView.getBounds().y).toBe(CHROME_HEIGHT);
  expect(readPrefs().firstRunGuideSeen).toBe(true);

  await invoke(IPC.guideShowBubbles);
  expect(handle.guideMode).toBe('bubbles');
  expect(handle.guideView?.getVisible()).toBe(true);
});

it('respects the saved opt-out while keeping manual help available', async () => {
  writePrefs({ firstRunGuideSeen: true });
  await openAuth();
  expect(handle.guideMode).toBe('bubbles');
  await invoke(IPC.guideBubbleDismissForever);
  expect(readPrefs().stepBubblesDismissed).toBe(true);
  await disposeAuthJob(handle.requestId);

  await openAuth();
  expect(handle.guideMode).toBe(null);
  expect(handle.guideView).toBeUndefined();
  expect(handle.contentView.getBounds().y).toBe(CHROME_HEIGHT);

  await invoke(IPC.guideShowBubbles);
  expect(handle.guideView?.getVisible()).toBe(true);
  expect(readPrefs().stepBubblesDismissed).toBe(true);
});
