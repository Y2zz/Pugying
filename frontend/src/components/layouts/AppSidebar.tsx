import { Link } from 'react-router-dom';
import {
  BookOpen,
  Bot,
  LifeBuoy,
  PieChart,
  Send,
  Settings2,
  SquareTerminal,
} from 'lucide-react';

import { NavMain } from './NavMain';
import { NavSecondary } from './NavSecondary';
import { NavUser } from './NavUser';
import { Logo } from '@/components/Logo';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
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
      title: '工作台',
      url: '#',
      icon: Bot,
      items: [
        { title: '项目管理', url: '/work/projects' },
        { title: '任务列表', url: '/work/tasks' },
      ],
    },
    {
      title: '数据中心',
      url: '#',
      icon: PieChart,
      items: [
        { title: '概览', url: '/data/overview' },
        { title: '报表', url: '/data/reports' },
      ],
    },
    {
      title: '文档',
      url: '#',
      icon: BookOpen,
      items: [
        { title: '使用指南', url: '/docs/guide' },
        { title: 'API 文档', url: '/docs/api' },
      ],
    },
    {
      title: '设置',
      url: '/settings',
      icon: Settings2,
    },
  ],
  navSecondary: [
    { title: '帮助中心', url: '/help', icon: LifeBuoy },
    { title: '反馈', url: '/feedback', icon: Send },
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
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link to="/" />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <Logo className="size-6" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">Pugying</span>
                <span className="truncate text-xs">蒲公英 · 内容发布</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
