import { FolderOpen, LayoutGrid, Link2, SquareTerminal } from 'lucide-react';

import { AppBrand } from '@/components/layouts/AppBrand';
import { NavMain } from '@/components/layouts/NavMain';
import { NavPublish } from '@/components/layouts/NavPublish';
import { NavUser } from '@/components/layouts/NavUser';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from '@/components/ui/sidebar';
import type { ComponentProps } from 'react';
import { getStoredUser } from '@/lib/api';

const data = {
  navMain: [
    {
      title: 'Dashboard',
      url: '/dashboard',
      icon: SquareTerminal,
      isActive: true,
    },
    {
      title: '作品管理',
      url: '/contents',
      icon: LayoutGrid,
    },
    {
      title: '媒体库',
      url: '/media-library',
      icon: FolderOpen,
    },
    {
      title: '媒体账号',
      url: '/platform-accounts',
      icon: Link2,
    },
  ],
};

export function AppSidebar({ ...props }: ComponentProps<typeof Sidebar>) {
  const stored = getStoredUser();
  const user = {
    name: stored?.username ?? 'Pugying',
    email: stored?.email ?? 'admin@pugying.local',
    avatar: '/avatars/pugying.jpg',
  };

  return (
    <Sidebar variant="inset" collapsible="icon" {...props}>
      <SidebarHeader>
        <AppBrand />
      </SidebarHeader>

      <SidebarContent>
        <NavPublish />
        <NavMain items={data.navMain} />
      </SidebarContent>

      {/* footer：用户菜单（团队切换 / 管理 / 退出登录均在下拉内） */}
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
