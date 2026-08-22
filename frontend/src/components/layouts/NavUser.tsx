import { ChevronsUpDown, LogOut, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { NavUserTeamMenu } from '@/components/layouts/NavUserTeamMenu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { clearSession, getStoredUser } from '@/lib/api';
import { canAccessAdmin } from '@/lib/permissions';

export function NavUser({
  user,
}: {
  user: {
    name: string;
    email: string;
    avatar: string;
  };
}) {
  const navigate = useNavigate();
  const showAdmin = canAccessAdmin(getStoredUser()?.permissions);

  const handleLogout = () => {
    clearSession();
    void navigate('/login', { replace: true });
  };

  const userBlock = (
    <>
      <Avatar className="size-8 rounded-lg">
        <AvatarImage src={user.avatar} alt={user.name} />
        <AvatarFallback className="rounded-lg">PU</AvatarFallback>
      </Avatar>
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">{user.name}</span>
        <span className="truncate text-xs">{user.email}</span>
      </div>
    </>
  );

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        {/* 始终可展开：用户信息区点击展开团队子菜单；管理入口按权限显示 */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="aria-expanded:bg-sidebar-accent aria-expanded:text-sidebar-accent-foreground"
              />
            }
          >
            {userBlock}
            <ChevronsUpDown className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--anchor-width) min-w-56 rounded-lg"
            side="top"
            align="end"
            sideOffset={4}
          >
            <DropdownMenuGroup className="p-1">
              <NavUserTeamMenu user={user} />
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            {/* 顺序：管理（有权限）→ 分隔线 → 退出登录 */}
            {showAdmin ? (
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onClick={() => {
                    void navigate('/admin');
                  }}
                >
                  <Settings />
                  管理
                </DropdownMenuItem>
              </DropdownMenuGroup>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut />
                退出登录
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
