import type { CSSProperties, ReactNode } from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { useSidebarExpanded } from '@/hooks/use-sidebar-expanded';
import { cn } from '@/lib/utils';

/** 展开宽相对 shadcn 默认 16rem 略收，给主内容更多横向空间 */
const SIDEBAR_WIDTH_EXPANDED = '14rem';

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
      // style 在 SidebarProvider 内联默认值之后展开，可盖过 --sidebar-width
      style={
        {
          '--sidebar-width': SIDEBAR_WIDTH_EXPANDED,
        } as CSSProperties
      }
    >
      {children}
    </SidebarProvider>
  );
}
