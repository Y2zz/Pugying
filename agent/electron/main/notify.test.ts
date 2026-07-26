import { BrowserWindow, WebContentsView } from 'electron';
import { IPC } from '@shared/ipc';
import type { AuthBrowserHandle } from './auth-browser';
import { notifyUser } from './notify';

interface SentMessage {
  channel: string;
  payload: unknown;
}

function makeHandle(): AuthBrowserHandle {
  const window = new BrowserWindow({ title: 'test' });
  const contentView = new WebContentsView();
  const handle = {
    kind: 'auth',
    requestId: 'notify-r1',
    platform: 'douyin',
    platformName: '抖音',
    window,
    contentView,
    authSession: {},
    guideMode: null,
    guideIndex: 0,
    pendingToastEvents: [],
    onResult: () => undefined,
    dispose: () => Promise.resolve(),
  };
  return handle as unknown as AuthBrowserHandle;
}

function sentOf(handle: AuthBrowserHandle): SentMessage[] {
  const toastView = handle.toastView as unknown as {
    webContents: { sent: SentMessage[] };
  };
  return toastView.webContents.sent;
}

describe('notifyUser', () => {
  it('does not throw without a window context (OS notification tier)', () => {
    expect(() => {
      notifyUser(null, '后台事件', 'info');
      notifyUser(undefined, '后台事件');
    }).not.toThrow();
  });

  it('queues the toast until the overlay reports ready', () => {
    const handle = makeHandle();
    notifyUser(handle, '已完成', 'success');

    // A toast view is created lazily and the event is buffered.
    expect(handle.toastView).toBeDefined();
    expect(handle.pendingToastEvents).toEqual([
      { channel: IPC.notice, payload: { text: '已完成', type: 'success' } },
    ]);
    expect(sentOf(handle)).toEqual([]);
  });

  it('sends directly once the toast overlay is ready', () => {
    const handle = makeHandle();
    notifyUser(handle, '第一条');
    handle.toastViewReady = true;
    notifyUser(handle, '第二条', 'error');

    expect(handle.pendingToastEvents).toHaveLength(1);
    expect(sentOf(handle)).toEqual([
      { channel: IPC.notice, payload: { text: '第二条', type: 'error' } },
    ]);
  });

  it('falls back to the OS tier when the window is destroyed', () => {
    const handle = makeHandle();
    handle.window.destroy();
    expect(() => {
      notifyUser(handle, '窗口已关');
    }).not.toThrow();
    expect(handle.pendingToastEvents).toEqual([]);
  });
});
