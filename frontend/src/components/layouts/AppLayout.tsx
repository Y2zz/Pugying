import { Outlet } from 'react-router-dom';
import { SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layouts/AppSidebar';
import { LayoutContent } from '@/components/layouts/LayoutContent';
import { ResponsiveSidebarProvider } from '@/components/layouts/ResponsiveSidebarProvider';
import type { ReactNode } from 'react';
import { useCreatorWindowSync } from '@/hooks/use-creator-window-sync';

/** 对齐 sidebar-08：文档级滚动，不在 inset 内再套一层 overflow */
export function AppLayout({ children }: { children?: ReactNode }) {
  // Creator-center windows outlive page navigation; sync cookies app-wide.
  useCreatorWindowSync();
  return (
    <ResponsiveSidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <LayoutContent>{children ?? <Outlet />}</LayoutContent>
      </SidebarInset>
    </ResponsiveSidebarProvider>
  );
}
