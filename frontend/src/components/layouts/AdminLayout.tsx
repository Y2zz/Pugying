import { Outlet } from 'react-router-dom';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AdminSidebar } from '@/components/layouts/AdminSidebar';
import { AgentStatusBadge } from '@/components/AgentStatusBadge';

export function AdminLayout() {
  return (
    <SidebarProvider>
      <AdminSidebar />
      {/* 与 AppLayout 相同的 inset 固定高度 + 内部滚动 */}
      <SidebarInset className="h-svh overflow-hidden md:peer-data-[variant=inset]:h-[calc(100svh-1rem)]">
        <header className="flex h-14 shrink-0 items-center gap-2">
          <div className="flex flex-1 items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <span className="text-sm font-medium">管理</span>
          </div>
          <div className="px-4">
            <AgentStatusBadge />
          </div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4 pt-0">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
