import type { ChromeShell } from '@/lib/chrome-api';

/**
 * Hand-rolled chromeShell stub for SSR smoke tests: every invoke resolves,
 * every subscription is a no-op that returns an unsubscribe function, and
 * `calls` records which bridge methods a component touched.
 */
export function makeChromeShellStub(): {
  chromeShell: ChromeShell;
  calls: string[];
} {
  const calls: string[] = [];
  const invoke = (name: string) => {
    return (): Promise<void> => {
      calls.push(name);
      return Promise.resolve();
    };
  };
  const subscribe = (name: string) => {
    return (): (() => void) => {
      calls.push(name);
      return () => undefined;
    };
  };

  const chromeShell = {
    back: invoke('back'),
    forward: invoke('forward'),
    reload: invoke('reload'),
    clearCache: invoke('clearCache'),
    requestClearCache: invoke('requestClearCache'),
    onClearCacheRun: subscribe('onClearCacheRun'),
    zoomIn: invoke('zoomIn'),
    zoomOut: invoke('zoomOut'),
    zoomReset: invoke('zoomReset'),
    complete: invoke('complete'),
    cancel: invoke('cancel'),
    openMoreMenu: invoke('openMoreMenu'),
    closeMoreMenu: invoke('closeMoreMenu'),
    menuReady: invoke('menuReady'),
    onMenuAnchor: subscribe('onMenuAnchor'),
    reportCompleteAnchor: invoke('reportCompleteAnchor'),
    onState: subscribe('onState'),
    onGuide: subscribe('onGuide'),
    onNotice: subscribe('onNotice'),
    guideNextFirstRun: invoke('guideNextFirstRun'),
    guideSkipFirstRun: invoke('guideSkipFirstRun'),
    guideFinishFirstRun: invoke('guideFinishFirstRun'),
    guideNextBubble: invoke('guideNextBubble'),
    guideCloseBubbles: invoke('guideCloseBubbles'),
    guideDismissBubblesForever: invoke('guideDismissBubblesForever'),
    guideShowBubbles: invoke('guideShowBubbles'),
    guideReady: invoke('guideReady'),
    toastReady: invoke('toastReady'),
    reportToastState: invoke('reportToastState'),
  } as unknown as ChromeShell;

  return { chromeShell, calls };
}

interface GlobalWithWindow {
  window?: unknown;
}

/**
 * Installs a minimal `window` global carrying the chromeShell bridge, the
 * way the preload script would in a real shell view. Returns a restore
 * function for afterEach.
 */
export function installWindowStub(): {
  chromeShell: ChromeShell;
  calls: string[];
  restore: () => void;
} {
  const { chromeShell, calls } = makeChromeShellStub();
  const globalRef = globalThis as GlobalWithWindow;
  const previous = globalRef.window;
  const hadPrevious = 'window' in globalRef;
  globalRef.window = {
    chromeShell,
    innerWidth: 1280,
    innerHeight: 800,
    location: { hash: '' },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  return {
    chromeShell,
    calls,
    restore: () => {
      if (hadPrevious) {
        globalRef.window = previous;
      } else {
        delete globalRef.window;
      }
    },
  };
}
