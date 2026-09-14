import type { ReactNode } from 'react';
import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import {
  toast,
  Toast,
  ToastAction,
  ToastClose,
  ToastContent,
  ToastDescription,
  ToastPortal,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  useToastManager,
} from '@/components/ui/toast';
import { cn } from '@/lib/utils';

/**
 * 应用级 Toast：顶部水平居中。
 * 不改 shadcn toast 默认底部栈，在业务层用相对布局 + 顶部视口覆盖。
 */
export function AppToaster({ children }: { children?: ReactNode }) {
  return (
    <ToastProvider toastManager={toast}>
      {children}
      <ToastPortal>
        <ToastViewport
          className={cn(
            'pointer-events-none fixed inset-x-0 top-4 bottom-auto z-50 mx-auto flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2 outline-none',
            'sm:left-1/2 sm:right-auto sm:w-full sm:-translate-x-1/2'
          )}
        >
          <AppToastList />
        </ToastViewport>
      </ToastPortal>
    </ToastProvider>
  );
}

function AppToastList() {
  const { toasts } = useToastManager();

  return toasts.map((item) => (
    <Toast
      key={item.id}
      toast={item}
      className={cn(
        // 覆盖默认「贴底绝对定位 + 堆叠变换」，改为顶部流式排列
        'relative right-auto bottom-auto z-auto h-auto w-full origin-top translate-none scale-100 opacity-100 shadow-lg',
        'data-starting-style:translate-y-[-0.75rem] data-starting-style:opacity-0 data-starting-style:scale-100',
        'data-ending-style:translate-y-[-0.75rem] data-ending-style:opacity-0 data-ending-style:scale-100',
        'data-expanded:h-auto data-expanded:translate-none data-limited:opacity-100'
      )}
    >
      <ToastContent className="data-behind:opacity-100">
        <AppToastIcon type={item.type} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <ToastTitle />
          <ToastDescription />
        </div>
        <ToastAction />
        <ToastClose />
      </ToastContent>
    </Toast>
  ));
}

function AppToastIcon({ type }: { type: string | undefined }) {
  if (type === 'success') {
    return (
      <span data-slot="toast-icon" className="shrink-0 text-emerald-600 [&_svg:not([class*='size-'])]:size-4 dark:text-emerald-400">
        <CircleCheckIcon aria-hidden />
      </span>
    );
  }
  if (type === 'info') {
    return (
      <span data-slot="toast-icon" className="shrink-0 [&_svg:not([class*='size-'])]:size-4">
        <InfoIcon aria-hidden />
      </span>
    );
  }
  if (type === 'warning') {
    return (
      <span data-slot="toast-icon" className="shrink-0 [&_svg:not([class*='size-'])]:size-4">
        <TriangleAlertIcon aria-hidden />
      </span>
    );
  }
  if (type === 'error') {
    return (
      <span data-slot="toast-icon" className="shrink-0 text-destructive [&_svg:not([class*='size-'])]:size-4">
        <OctagonXIcon aria-hidden />
      </span>
    );
  }
  if (type === 'loading') {
    return (
      <span data-slot="toast-icon" className="shrink-0 [&_svg:not([class*='size-'])]:size-4">
        <Loader2Icon className="animate-spin" aria-hidden />
      </span>
    );
  }
  return null;
}

export { toast };
