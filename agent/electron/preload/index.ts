import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC,
  type AnchorRect,
  type ChromeNotice,
  type ChromeState,
  type GuidePayload,
  type MoreMenuAnchor,
} from '@shared/ipc';

const chromeShell = {
  back: () => ipcRenderer.invoke(IPC.back),
  forward: () => ipcRenderer.invoke(IPC.forward),
  reload: (hard?: boolean) => ipcRenderer.invoke(IPC.reload, hard === true),
  clearCache: () => ipcRenderer.invoke(IPC.clearCache),
  requestClearCache: () => ipcRenderer.invoke(IPC.clearCacheRequest),
  onClearCacheRun: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on(IPC.clearCacheRun, handler);
    return () => ipcRenderer.removeListener(IPC.clearCacheRun, handler);
  },
  zoomIn: () => ipcRenderer.invoke(IPC.zoomIn),
  zoomOut: () => ipcRenderer.invoke(IPC.zoomOut),
  zoomReset: () => ipcRenderer.invoke(IPC.zoomReset),
  complete: () => ipcRenderer.invoke(IPC.complete),
  cancel: () => ipcRenderer.invoke(IPC.cancel),
  openMoreMenu: (anchor: MoreMenuAnchor) =>
    ipcRenderer.invoke(IPC.moreMenu, anchor),
  closeMoreMenu: () => ipcRenderer.invoke(IPC.moreMenuClose),
  menuReady: () => ipcRenderer.invoke(IPC.menuReady),
  onMenuAnchor: (callback: (anchor: MoreMenuAnchor) => void) => {
    const handler = (_event: unknown, anchor: MoreMenuAnchor) =>
      callback(anchor);
    ipcRenderer.on(IPC.menuAnchor, handler);
    return () => ipcRenderer.removeListener(IPC.menuAnchor, handler);
  },
  reportCompleteAnchor: (rect: AnchorRect) =>
    ipcRenderer.invoke(IPC.completeAnchor, rect),
  onState: (callback: (state: ChromeState) => void) => {
    const handler = (_event: unknown, state: ChromeState) => callback(state);
    ipcRenderer.on(IPC.state, handler);
    return () => ipcRenderer.removeListener(IPC.state, handler);
  },
  onGuide: (callback: (guide: GuidePayload) => void) => {
    const handler = (_event: unknown, guide: GuidePayload) => callback(guide);
    ipcRenderer.on(IPC.guide, handler);
    return () => ipcRenderer.removeListener(IPC.guide, handler);
  },
  onNotice: (callback: (notice: ChromeNotice) => void) => {
    const handler = (_event: unknown, notice: ChromeNotice) =>
      callback(notice);
    ipcRenderer.on(IPC.notice, handler);
    return () => ipcRenderer.removeListener(IPC.notice, handler);
  },
  guideNextFirstRun: () => ipcRenderer.invoke(IPC.guideFirstNext),
  guideSkipFirstRun: () => ipcRenderer.invoke(IPC.guideFirstSkip),
  guideFinishFirstRun: () => ipcRenderer.invoke(IPC.guideFirstFinish),
  guideNextBubble: () => ipcRenderer.invoke(IPC.guideBubbleNext),
  guideCloseBubbles: () => ipcRenderer.invoke(IPC.guideBubbleClose),
  guideDismissBubblesForever: () =>
    ipcRenderer.invoke(IPC.guideBubbleDismissForever),
  guideShowBubbles: () => ipcRenderer.invoke(IPC.guideShowBubbles),
  guideReady: () => ipcRenderer.invoke(IPC.guideReady),
  toastReady: () => ipcRenderer.invoke(IPC.toastReady),
  reportToastState: (active: boolean) =>
    ipcRenderer.invoke(IPC.toastState, active === true),
};

export type ChromeShell = {
  [K in keyof typeof chromeShell]: (typeof chromeShell)[K];
};

contextBridge.exposeInMainWorld('chromeShell', chromeShell);
