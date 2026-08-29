import { Outlet } from 'react-router-dom';
import { ProductUpdateDialog } from '@/components/ProductUpdateDialog';
import { SidebarInset } from '@/components/ui/sidebar';
import { AdminSidebar } from '@/components/layouts/AdminSidebar';
import { LayoutContent } from '@/components/layouts/LayoutContent';
import { ResponsiveSidebarProvider } from '@/components/layouts/ResponsiveSidebarProvider';

/** 与 AppLayout / sidebar-08 一致：文档级滚动 */
export function AdminLayout() {
  return (
    <>
      <ProductUpdateDialog />
      <ResponsiveSidebarProvider>
        <AdminSidebar />
        <SidebarInset className="min-w-0">
          <LayoutContent>
            <Outlet />
          </LayoutContent>
        </SidebarInset>
      </ResponsiveSidebarProvider>
    </>
  );
}
