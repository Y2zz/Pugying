import { LayoutGrid, Link2, SquareTerminal } from 'lucide-react';

import { NavMain } from '@/components/layouts/NavMain';
import { NavPublish } from '@/components/layouts/NavPublish';
import { NavUser } from '@/components/layouts/NavUser';
import { TeamSwitcher } from '@/components/layouts/TeamSwitcher';

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
      title: '内容管理',
      url: '/contents',
      icon: LayoutGrid,
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
        <TeamSwitcher />
      </SidebarHeader>

      <SidebarContent>
        <NavPublish />
        <NavMain items={data.navMain} />
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
