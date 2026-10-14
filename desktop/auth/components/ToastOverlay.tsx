import { useCallback, useEffect } from 'react';
import { Toaster, toast, useToastManager } from '@auth/components/ui/toast';
import { getChromeShell } from '@auth/lib/chrome-api';

/**
 * Content of the dedicated toast WebContentsView (hash `#toasts`), pinned
 * top-right below the toolbar. The main process keeps the view
 * hidden while there are no toasts (it would swallow clicks otherwise) and
 * queues events until `toastReady` confirms this component is mounted.
 */
export function ToastOverlay() {
  const api = getChromeShell();

  useEffect(() => {
    const offNotice = api.onNotice(({ text, type }) => {
      toast.add({
        description: text,
        type: type ?? 'info',
        timeout: 3000,
      });
    });
    // One toast tracks the whole clear-cache flow; the invoke's promise
    // settles when the main-process handler finishes or throws.
    const offClearCache = api.onClearCacheRun(() => {
      void toast
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

  // 不改 ui/toast：在业务层监听栈长度，驱动主进程显示/隐藏 toast 窗
  return (
    <Toaster>
      <ToastActivityReporter onActiveChange={handleActiveChange} />
    </Toaster>
  );
}

function ToastActivityReporter({
  onActiveChange,
}: {
  onActiveChange: (active: boolean) => void;
}) {
  const { toasts } = useToastManager();

  useEffect(() => {
    onActiveChange(toasts.length > 0);
  }, [toasts.length, onActiveChange]);

  return null;
}
