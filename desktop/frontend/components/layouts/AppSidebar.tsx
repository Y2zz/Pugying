import { FolderOpen, LayoutGrid, Link2, SquareTerminal } from 'lucide-react';

import { AppBrand } from '@/components/layouts/AppBrand';
import { NavMain } from '@/components/layouts/NavMain';
import { NavPublish } from '@/components/layouts/NavPublish';
import { NavUser } from '@/components/layouts/NavUser';
import { AgentStatusBadge } from '@/components/AgentStatusBadge';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from '@/components/ui/sidebar';
import type { ComponentProps } from 'react';

const data = {
  navMain: [
    {
      title: 'Dashboard',
      url: '/dashboard',
      icon: SquareTerminal,
      end: true,
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
  const user = {
    name: '蒲公英',
    email: '个人单机版',
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

      {/* footer：本机 Agent + 用户菜单 */}
      <SidebarFooter>
        <AgentStatusBadge placement="sidebar" />
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
