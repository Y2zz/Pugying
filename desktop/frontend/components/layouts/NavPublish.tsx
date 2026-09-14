import { Link, useLocation } from 'react-router-dom';
import { ChevronDown, Clapperboard, FileText, Plus } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';

/** 主菜单上方的发布入口：下拉选择发布图文 / 视频 */
export function NavPublish() {
  const { isMobile } = useSidebar();
  const { pathname } = useLocation();
  const publishActive = pathname.startsWith('/publish/');

  return (
    <SidebarGroup>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <SidebarMenuButton
                  tooltip="发布"
                  isActive={publishActive}
                  // 与 NavMain 同为 default 尺寸，避免 lg 块状按钮在侧栏里突兀；主色保留作 CTA
                  className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground data-open:bg-primary/90 data-open:text-primary-foreground data-open:hover:bg-primary/90 data-open:hover:text-primary-foreground data-active:bg-primary/90 data-active:text-primary-foreground"
                />
              }
            >
              <Plus />
              <span>发布</span>
              <ChevronDown className="ml-auto" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-(--anchor-width) min-w-48 rounded-lg"
              align="start"
              side={isMobile ? 'bottom' : 'bottom'}
              sideOffset={4}
            >
              <DropdownMenuGroup>
                <DropdownMenuItem render={<Link to="/publish/article" />}>
                  <FileText />
                  <div className="grid leading-tight">
                    <span>发布图文</span>
                    <span className="text-xs text-muted-foreground">图片 + 文字内容</span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem render={<Link to="/publish/video" />}>
                  <Clapperboard />
                  <div className="grid leading-tight">
                    <span>发布视频</span>
                    <span className="text-xs text-muted-foreground">上传视频内容</span>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  );
}
