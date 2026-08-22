import { Outlet } from 'react-router-dom';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layouts/AppSidebar';
import type { ReactNode } from 'react';
import { AgentStatusBadge } from '@/components/AgentStatusBadge';
import { useCreatorWindowSync } from '@/hooks/use-creator-window-sync';

export function AppLayout({ children }: { children?: ReactNode }) {
  // Creator-center windows outlive page navigation; sync cookies app-wide.
  useCreatorWindowSync();
  return (
    <SidebarProvider>
      <AppSidebar />
      {/* inset：固定视口高度 + 内容区内滚动，避免 body 滚动把顶栏带出圆角卡片 */}
      <SidebarInset className="h-svh overflow-hidden md:peer-data-[variant=inset]:h-[calc(100svh-1rem)]">
        <header className="flex h-14 shrink-0 items-center gap-2">
          <div className="flex flex-1 items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
          </div>
          <div className="px-4">
            <AgentStatusBadge />
          </div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4 pt-0">
          {children ?? <Outlet />}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
