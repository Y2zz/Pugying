import {
  BookOpen,
  Bot,
  LayoutGrid,
  LifeBuoy,
  Link2,
  PieChart,
  Send,
  Settings2,
  SquareTerminal,
} from 'lucide-react';

import { NavMain } from '@/components/layouts/NavMain';
import { NavPublish } from '@/components/layouts/NavPublish';
import { NavSecondary } from '@/components/layouts/NavSecondary';
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
        <TeamSwitcher />
      </SidebarHeader>

      <SidebarContent>
        <NavPublish />
        <NavMain items={data.navMain} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
