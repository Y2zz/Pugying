import type { ReactNode } from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { useSidebarExpanded } from '@/hooks/use-sidebar-expanded';

/** 业务 / 管理布局共用：侧栏展开态仅随视口宽度变化 */
export function ResponsiveSidebarProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useSidebarExpanded();

  return (
    <SidebarProvider open={open} onOpenChange={setOpen}>
      {children}
    </SidebarProvider>
  );
}
