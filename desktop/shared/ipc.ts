/**
 * Single source of truth for the auth-shell IPC surface.
 * Imported by the main process, the preload script, and the renderer,
 * so channel names and payload shapes can never drift apart.
 */

export const IPC = {
  back: 'chrome:back',
  forward: 'chrome:forward',
  reload: 'chrome:reload',
  /** does the actual work; invoked by the TOOLBAR so its promise can drive
   *  a loading/success/error toast in the same view */
  clearCache: 'chrome:clear-cache',
  /** menu asks main to hand the clear-cache flow over to the toolbar */
  clearCacheRequest: 'chrome:clear-cache-request',
  zoomIn: 'chrome:zoom-in',
  zoomOut: 'chrome:zoom-out',
  zoomReset: 'chrome:zoom-reset',
  complete: 'chrome:complete',
  cancel: 'chrome:cancel',
  moreMenu: 'chrome:more-menu',
  moreMenuClose: 'chrome:more-menu-close',
  /** menu overlay renderer signals it's mounted and ready for the anchor */
  menuReady: 'chrome:menu-ready',
  /** toast overlay signals it's mounted; main flushes queued events */
  toastReady: 'chrome:toast-ready',
  /** toast overlay reports whether any toast is visible (view show/hide) */
  toastState: 'chrome:toast-state',
  completeAnchor: 'chrome:complete-anchor',
  guideFirstNext: 'chrome:guide-first-next',
  guideFirstSkip: 'chrome:guide-first-skip',
  guideFirstFinish: 'chrome:guide-first-finish',
  guideBubbleNext: 'chrome:guide-bubble-next',
  guideBubbleClose: 'chrome:guide-bubble-close',
  guideBubbleDismissForever: 'chrome:guide-bubble-dismiss-forever',
  guideShowBubbles: 'chrome:guide-show-bubbles',
  guideReady: 'chrome:guide-ready',
  /** main -> renderer push channels */
  state: 'chrome:state',
  guide: 'chrome:guide',
  menuAnchor: 'chrome:menu-anchor',
  notice: 'chrome:notice',
  clearCacheRun: 'chrome:clear-cache-run',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];

/** Auth-shell chrome: toolbar (48), window-content px */
export const CHROME_HEIGHT = 48;

export interface ChromeState {
  url?: string;
  title?: string;
  canGoBack?: boolean;
  canGoForward?: boolean;
  zoomFactor?: number;
  /** which window hosts this shell UI; guides/auth actions are auth-only */
  kind?: 'auth' | 'browse';
}

/** Content-area position of the "more" trigger, CSS pixels */
export interface MoreMenuAnchor {
  x: number;
  y: number;
}

export type NoticeType = 'info' | 'success' | 'error';

/** Transient user-facing notice rendered as a toast */
export interface ChromeNotice {
  text: string;
  /** drives the toast's status icon; defaults to 'info' */
  type?: NoticeType;
}

/** Rect of a toolbar control, in window-content CSS pixels */
export interface AnchorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type GuideAnchor = 'content' | 'complete';

export interface GuideSlide {
  id: string;
  title: string;
  body: string;
}

export interface GuideBubbleStep {
  id: string;
  title: string;
  body: string;
  anchor: GuideAnchor;
}

export type GuidePayload =
  | {
      kind: 'first-run';
      platformName: string;
      slideIndex: number;
      slides: GuideSlide[];
    }
  | {
      kind: 'bubbles';
      platformName: string;
      stepIndex: number;
      steps: GuideBubbleStep[];
      /** Toolbar 「完成授权」 rect in window-content px; null until reported */
      completeAnchor: AnchorRect | null;
    };
