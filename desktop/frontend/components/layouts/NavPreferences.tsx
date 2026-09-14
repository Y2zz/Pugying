import { NavLink, useLocation } from 'react-router-dom';
import { SlidersHorizontal } from 'lucide-react';

import { useProductUpdate } from '@/components/ProductUpdateDialog';
import { NavThemeToggle } from '@/components/layouts/NavThemeToggle';
import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { APP_VERSION } from '@/lib/app-version';

/** 侧栏底部：左侧版本号（产品更新入口），右侧主题切换 + 偏好设置 */
export function NavPreferences() {
  const { pathname } = useLocation();
  const prefsActive = pathname === '/preferences' || pathname.startsWith('/preferences/');
  const { openManually, spaUpdateAvailable, remoteVersion } = useProductUpdate();
  const versionTooltip = spaUpdateAvailable
    ? `有新版本 v${remoteVersion}，点击更新`
    : `当前 v${APP_VERSION}，点击查看`;

  return (
    <SidebarFooter>
      {/* 展开：版本 + 主题 + 偏好横排；折叠：主题/偏好竖排，避免挤出 icon 列 */}
      <SidebarMenu className="flex-row items-center gap-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center">
        <SidebarMenuItem className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
          <SidebarMenuButton
            tooltip={versionTooltip}
            type="button"
            className="h-8 w-auto! max-w-full justify-start px-2 text-xs text-muted-foreground hover:text-sidebar-foreground"
            onClick={openManually}
          >
            <span className="relative inline-flex max-w-full items-center pe-1.5">
              <span className="truncate">v{APP_VERSION}</span>
              {spaUpdateAvailable ? (
                <span
                  aria-hidden
                  className="absolute top-0 right-0 size-1.5 translate-x-1/4 -translate-y-1/4 rounded-full bg-destructive"
                />
              ) : null}
            </span>
            <span className="sr-only">产品更新</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <NavThemeToggle />
        <SidebarMenuItem>
          <SidebarMenuButton
            tooltip="偏好设置"
            isActive={prefsActive}
            render={<NavLink to="/preferences" end />}
            className="w-auto! justify-center group-data-[collapsible=icon]:size-8!"
          >
            <SlidersHorizontal />
            <span className="sr-only">偏好设置</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
}
