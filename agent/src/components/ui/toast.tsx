import { useEffect } from 'react';
import { Toast } from '@base-ui/react/toast';
import {
  CircleAlertIcon,
  CircleCheckIcon,
  InfoIcon,
  LoaderCircleIcon,
  XIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * `toast.type` is set automatically by `toastManager.promise`
 * (loading → success / error) and manually via `toastManager.add({ type })`.
 */
function ToastIcon({ type }: { type?: string }) {
  switch (type) {
    case 'loading':
      return (
        <LoaderCircleIcon className="size-4 shrink-0 animate-spin text-muted-foreground" />
      );
    case 'success':
      return <CircleCheckIcon className="size-4 shrink-0 text-emerald-500" />;
    case 'error':
      return <CircleAlertIcon className="size-4 shrink-0 text-destructive" />;
    case 'info':
      return <InfoIcon className="size-4 shrink-0 text-muted-foreground" />;
    default:
      return null;
  }
}

/**
 * Imperative manager so non-React code (IPC listeners) can fire toasts:
 *   toastManager.add({ title: '…', description: '…', timeout: 3000 })
 *   toastManager.promise(promise, { loading, success, error })
 */
export const toastManager = Toast.createToastManager();

interface ToastListProps {
  onActiveChange?: (active: boolean) => void;
}

function ToastList({ onActiveChange }: ToastListProps) {
  const { toasts } = Toast.useToastManager();

  useEffect(() => {
    onActiveChange?.(toasts.length > 0);
  }, [toasts.length, onActiveChange]);

  return toasts.map((toast) => (
    <Toast.Root
      key={toast.id}
      toast={toast}
      data-slot="toast"
      className={cn(
        'group pointer-events-auto relative flex w-full items-center gap-3 overflow-hidden rounded-md border border-border bg-background p-4 pr-8 text-foreground shadow-lg',
        'transition-all duration-200',
        'data-[starting-style]:-translate-y-4 data-[starting-style]:opacity-0',
        'data-[ending-style]:translate-x-full data-[ending-style]:opacity-0',
      )}
    >
      <ToastIcon type={toast.type} />
      <Toast.Content className="flex min-w-0 flex-1 flex-col gap-1">
        <Toast.Title className="text-sm font-semibold empty:hidden" />
        <Toast.Description className="text-sm text-muted-foreground empty:hidden" />
      </Toast.Content>
      <Toast.Close
        aria-label="关闭通知"
        className="absolute right-1 top-1 rounded-md p-1 text-foreground/50 opacity-0 transition-opacity hover:text-foreground focus:opacity-100 focus:outline-none group-hover:opacity-100"
      >
        <XIcon className="size-4" />
      </Toast.Close>
    </Toast.Root>
  ));
}

export interface ToasterProps {
  /** Notified when the first toast appears / the last one leaves. */
  onActiveChange?: (active: boolean) => void;
}

/**
 * shadcn-style toaster: stacked cards in the bottom-right corner.
 * In the auth shell this renders inside a dedicated WebContentsView that the
 * main process shows/hides via `onActiveChange` (an invisible view would
 * still swallow clicks, so it must be hidden whenever there are no toasts).
 */
export function Toaster({ onActiveChange }: ToasterProps) {
  return (
    <Toast.Provider toastManager={toastManager} timeout={3000} limit={3}>
      <Toast.Portal>
        <Toast.Viewport
          data-slot="toast-viewport"
          className="fixed right-4 top-2 z-50 flex w-[356px] flex-col gap-2"
        >
          <ToastList onActiveChange={onActiveChange} />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}
