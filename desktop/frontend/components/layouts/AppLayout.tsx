import { Outlet } from 'react-router-dom';
import { SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layouts/AppSidebar';
import { DesktopTitleBar } from '@/components/layouts/DesktopTitleBar';
import { LayoutContent } from '@/components/layouts/LayoutContent';
import { ResponsiveSidebarProvider } from '@/components/layouts/ResponsiveSidebarProvider';
import { ProductUpdateProvider } from '@/components/ProductUpdateDialog';
import type { ReactNode } from 'react';
import { useCreatorWindowSync } from '@/hooks/use-creator-window-sync';

/** 侧栏固定视口；主内容在 SidebarInset（main）内滚动。Windows 顶栏单独成行。 */
export function AppLayout({ children }: { children?: ReactNode }) {
  // Creator-center windows outlive page navigation; sync cookies app-wide.
  useCreatorWindowSync();
  return (
    <ProductUpdateProvider>
      <div className="flex h-svh flex-col overflow-hidden">
        <DesktopTitleBar />
        <ResponsiveSidebarProvider className="h-auto min-h-0 flex-1">
          <AppSidebar />
          <SidebarInset className="min-h-0 min-w-0 overflow-x-hidden overflow-y-auto">
            <LayoutContent>{children ?? <Outlet />}</LayoutContent>
          </SidebarInset>
        </ResponsiveSidebarProvider>
      </div>
    </ProductUpdateProvider>
  );
}
