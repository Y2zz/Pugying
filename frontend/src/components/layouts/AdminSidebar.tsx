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
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Logo } from '@/components/Logo';
import { getStoredUser } from '@/lib/api';
import { hasPermission, Permissions } from '@/lib/permissions';
import { NavUser } from '@/components/layouts/NavUser';

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
  const user = {
    name: stored?.username ?? 'Pugying',
    email: stored?.email ?? 'admin@pugying.local',
    avatar: '/avatars/pugying.jpg',
  };

  const visibleNav = adminNav.filter((item) => {
    if (!item.requiredPermission) {
      return true;
    }
    return hasPermission(permissions, item.requiredPermission);
  });

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link to="/admin" />}>
              <div className="flex aspect-square size-fit shrink-0 items-center justify-center rounded-lg bg-sidebar-primary p-1.5 text-sidebar-primary-foreground">
                <Logo className="" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">管理</span>
                <span className="truncate text-xs text-muted-foreground">
                  Admin
                </span>
              </div>
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

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link to="/dashboard" />}>
              <ArrowLeft />
              <span>返回应用</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
