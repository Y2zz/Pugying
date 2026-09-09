import { Link } from 'react-router-dom';

import { Logo } from '@/components/Logo';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { APP_VERSION } from '@/lib/app-version';

/**
 * 业务区侧栏品牌区：Logo + 产品名 + 版本，点击回首页。
 * 用 SidebarMenuButton size="lg"，折叠为 icon 时只保留 size-8 Logo 方块，避免与菜单项错位。
 * 团队切换见侧栏 footer NavUser 下拉菜单。
 */
export function AppBrand() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          size="lg"
          tooltip={`Pugying v${APP_VERSION}`}
          // 无悬停底色：品牌可点回首页，但不走 ghost/accent 高亮
          className="hover:bg-transparent hover:text-sidebar-foreground active:bg-transparent active:text-sidebar-foreground data-active:bg-transparent"
          render={<Link to="/dashboard" />}
        >
          <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Logo className="size-4" />
          </div>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium">Pugying</span>
            <span className="truncate text-xs text-muted-foreground">
              蒲公英 · v{APP_VERSION}
            </span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
