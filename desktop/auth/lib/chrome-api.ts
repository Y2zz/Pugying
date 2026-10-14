import type {
  AnchorRect,
  ChromeNotice,
  ChromeState,
  GuidePayload,
  MoreMenuAnchor,
} from '@shared/ipc';

export type {
  AnchorRect,
  ChromeNotice,
  ChromeState,
  GuideBubbleStep,
  GuidePayload,
  GuideSlide,
  MoreMenuAnchor,
} from '@shared/ipc';

export interface ChromeShell {
  back: () => Promise<void>;
  forward: () => Promise<void>;
  reload: (hard?: boolean) => Promise<void>;
  clearCache: () => Promise<void>;
  requestClearCache: () => Promise<void>;
  onClearCacheRun: (callback: () => void) => () => void;
  zoomIn: () => Promise<void>;
  zoomOut: () => Promise<void>;
  zoomReset: () => Promise<void>;
  complete: () => Promise<void>;
  cancel: () => Promise<void>;
  openMoreMenu: (anchor: MoreMenuAnchor) => Promise<void>;
  closeMoreMenu: () => Promise<void>;
  menuReady: () => Promise<void>;
  onMenuAnchor: (callback: (anchor: MoreMenuAnchor) => void) => () => void;
  reportCompleteAnchor: (rect: AnchorRect) => Promise<void>;
  onState: (callback: (state: ChromeState) => void) => () => void;
  onGuide: (callback: (guide: GuidePayload) => void) => () => void;
  onNotice: (callback: (notice: ChromeNotice) => void) => () => void;
  guideNextFirstRun: () => Promise<void>;
  guideSkipFirstRun: () => Promise<void>;
  guideFinishFirstRun: () => Promise<void>;
  guideNextBubble: () => Promise<void>;
  guideCloseBubbles: () => Promise<void>;
  guideDismissBubblesForever: () => Promise<void>;
  guideShowBubbles: () => Promise<void>;
  guideReady: () => Promise<void>;
  toastReady: () => Promise<void>;
  reportToastState: (active: boolean) => Promise<void>;
}

declare global {
  interface Window {
    chromeShell: ChromeShell;
  }
}

export function getChromeShell(): ChromeShell {
  if (!window.chromeShell) {
    throw new Error('chromeShell is not available');
  }
  return window.chromeShell;
}
