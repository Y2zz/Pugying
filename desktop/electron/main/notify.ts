import { Notification } from 'electron';
import { IPC, type ChromeNotice, type NoticeType } from '@shared/ipc';
import { sendToastEvent, type AuthBrowserHandle } from './auth-browser';

/**
 * Tiered user notification for a tray-resident agent:
 *
 * 1. With a live auth-window context, show a toast in that window's
 *    bottom-right toast overlay — closest to where the user acted.
 * 2. Without one (tray actions, background WS events, window already
 *    closed), fall back to an OS notification.
 *
 * Note: on macOS, dev builds that aren't signed/bundled may not display
 * OS notifications; packaged builds do.
 */
export function notifyUser(
  handle: AuthBrowserHandle | null | undefined,
  text: string,
  type: NoticeType = 'info',
): void {
  if (handle && !handle.window.isDestroyed()) {
    const notice: ChromeNotice = { text, type };
    sendToastEvent(handle, IPC.notice, notice);
    return;
  }
  if (Notification.isSupported()) {
    new Notification({ title: '蒲公英', body: text }).show();
  }
}
