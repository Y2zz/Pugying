import { FolderOpen, LayoutGrid, Link2, SquareTerminal } from 'lucide-react';

import { AppBrand } from '@/components/layouts/AppBrand';
import { NavMain } from '@/components/layouts/NavMain';
import { NavPreferences } from '@/components/layouts/NavPreferences';
import { NavPublish } from '@/components/layouts/NavPublish';

import {
  Sidebar,
  SidebarContent,
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
  return (
    <Sidebar variant="inset" collapsible="icon" {...props}>
      <SidebarHeader>
        <AppBrand />
      </SidebarHeader>

      <SidebarContent>
        <NavPublish />
        <NavMain items={data.navMain} />
      </SidebarContent>

      <NavPreferences />
    </Sidebar>
  );
}
