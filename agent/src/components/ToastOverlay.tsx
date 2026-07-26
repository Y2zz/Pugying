import { useCallback, useEffect } from 'react';
import { Toaster, toastManager } from '@/components/ui/toast';
import { getChromeShell } from '@/lib/chrome-api';

/**
 * Content of the dedicated toast WebContentsView (hash `#toasts`), pinned
 * bottom-right above the platform page. The main process keeps the view
 * hidden while there are no toasts (it would swallow clicks otherwise) and
 * queues events until `toastReady` confirms this component is mounted.
 */
export function ToastOverlay() {
  const api = getChromeShell();

  useEffect(() => {
    const offNotice = api.onNotice(({ text, type }) => {
      toastManager.add({
        description: text,
        type: type ?? 'info',
        timeout: 3000,
      });
    });
    // One toast tracks the whole clear-cache flow; the invoke's promise
    // settles when the main-process handler finishes or throws.
    const offClearCache = api.onClearCacheRun(() => {
      void toastManager
        .promise(api.clearCache(), {
          loading: { description: '正在清除缓存…' },
          success: {
            description: '缓存已清除，如页面异常请刷新',
            timeout: 3000,
          },
          error: {
            description: '清除缓存失败，请重试',
            timeout: 5000,
          },
        })
        // the error toast is the user-facing handling; swallow the rethrow
        .catch(() => undefined);
    });
    void api.toastReady();
    return () => {
      offNotice();
      offClearCache();
    };
  }, [api]);

  const handleActiveChange = useCallback(
    (active: boolean) => {
      void api.reportToastState(active);
    },
    [api],
  );

  return <Toaster onActiveChange={handleActiveChange} />;
}
