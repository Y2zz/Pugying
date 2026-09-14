import type { ReactNode } from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { useSidebarExpanded } from '@/hooks/use-sidebar-expanded';
import { cn } from '@/lib/utils';

/** 业务布局共用：侧栏展开态仅随视口宽度变化 */
export function ResponsiveSidebarProvider({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useSidebarExpanded();

  return (
    <SidebarProvider
      open={open}
      onOpenChange={setOpen}
      // 视口高度锁死，滚动交给 SidebarInset（main）
      className={cn('h-svh overflow-hidden', className)}
    >
      {children}
    </SidebarProvider>
  );
}
