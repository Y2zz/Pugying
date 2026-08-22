import {
  ArrowLeft,
  Settings2,
  Shield,
  Users,
  LayoutDashboard,
} from 'lucide-react';
import { Link, NavLink, useLocation } from 'react-router-dom';

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { getStoredUser } from '@/lib/api';
import { hasPermission, Permissions } from '@/lib/permissions';

const adminNav = [
  {
    title: '概览',
    url: '/admin',
    icon: LayoutDashboard,
    end: true,
    requiredPermission: null as string | null,
  },
  {
    title: '成员',
    url: '/admin/members',
    icon: Users,
    end: false,
    requiredPermission: Permissions.Identity.Users.View,
  },
  {
    title: '角色',
    url: '/admin/roles',
    icon: Shield,
    end: false,
    requiredPermission: Permissions.Identity.Roles.View,
  },
  {
    title: '团队设置',
    url: '/admin/team',
    icon: Settings2,
    end: false,
    requiredPermission: Permissions.TeamManagement.Teams.View,
  },
];

export function AdminSidebar() {
  const location = useLocation();
  const stored = getStoredUser();
  const permissions = stored?.permissions ?? [];

  const visibleNav = adminNav.filter((item) => {
    if (!item.requiredPermission) {
      return true;
    }
    return hasPermission(permissions, item.requiredPermission);
  });

  return (
    <Sidebar variant="inset" collapsible="icon">
      {/* 管理区无用户菜单；顶部提供返回业务区入口 */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="返回应用" render={<Link to="/dashboard" />}>
              <ArrowLeft />
              <span>返回应用</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>团队管理</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleNav.map((item) => {
                const active = item.end
                  ? location.pathname === item.url
                  : location.pathname.startsWith(item.url);
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      isActive={active}
                      tooltip={item.title}
                      render={<NavLink to={item.url} end={item.end} />}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
