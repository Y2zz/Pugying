import { Outlet } from 'react-router-dom';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { AppSidebar } from '@/components/layouts/AppSidebar';
import type { ReactNode } from 'react';
import { BreadcrumbNav } from '@/components/layouts/BreadcrumbNav.tsx';
import { AgentStatusBadge } from '@/components/AgentStatusBadge';
import { useCreatorWindowSync } from '@/hooks/use-creator-window-sync';

export function AppLayout({ children }: { children?: ReactNode }) {
  // Creator-center windows outlive page navigation; sync cookies app-wide.
  useCreatorWindowSync();
  return (
    <SidebarProvider>
      <AppSidebar />
      {/* Fixed-height inset with internal scrolling: keeps the sidebar canvas
          (bg-sidebar) margins/rounded corners visible while content scrolls,
          instead of the white card hitting the viewport edges via body scroll. */}
      <SidebarInset className="h-svh overflow-hidden md:peer-data-[variant=inset]:h-[calc(100svh-1rem)]">
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex flex-1 items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
            <BreadcrumbNav />
          </div>
          <div className="px-4">
            <AgentStatusBadge />
          </div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4 pt-0">{children ?? <Outlet />}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
