import { useState } from 'react';
import { AlertCircle, Building2, ChevronsUpDown, LogOut } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar';
import { Logo } from '@/components/Logo';
import { useTeam } from '@/hooks/use-team';
import { getStoredUser } from '@/lib/api';
import { hasPermission, Permissions } from '@/lib/permissions';

export function TeamSwitcher() {
  const { isMobile } = useSidebar();
  const { teams, current, loading, switchTo, leaveCurrent } = useTeam();
  const permissions = getStoredUser()?.permissions ?? [];
  const canLeave = hasPermission(permissions, Permissions.Account.Users.Leave);
  const canLeaveCurrent = canLeave && !!current && teams.length > 1;

  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState('');

  const title = current?.displayName ?? (loading ? '加载中…' : '未选择团队');

  const handleLeave = async () => {
    setLeaving(true);
    setLeaveError('');
    try {
      await leaveCurrent();
    } catch (err) {
      setLeaveError(err instanceof Error ? err.message : '离开团队失败');
      setLeaving(false);
    }
  };

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger render={<SidebarMenuButton size="lg" className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground" />}>
              <div className="flex aspect-square size-fit shrink-0 items-center justify-center rounded-lg bg-sidebar-primary p-1.5 text-sidebar-primary-foreground">
                <Logo className="" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">Pugying</span>
                <span className="truncate text-xs text-muted-foreground">{title}</span>
              </div>
              <ChevronsUpDown className="ml-auto" />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-(--anchor-width) min-w-56 rounded-lg" align="start" side={isMobile ? 'bottom' : 'right'} sideOffset={4}>
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs text-muted-foreground">团队</DropdownMenuLabel>
                {teams.map((team) => (
                  <DropdownMenuItem
                    key={team.id}
                    onClick={() => {
                      void switchTo(team);
                    }}
                  >
                    <Building2 />
                    <span className="truncate">{team.displayName}</span>
                    {team.id === current?.id ? <span className="ml-auto text-xs text-muted-foreground">当前</span> : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              {canLeaveCurrent ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => {
                        setLeaveError('');
                        setLeaveOpen(true);
                      }}
                    >
                      <LogOut />
                      离开当前团队
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <AlertDialog
        open={leaveOpen}
        onOpenChange={(open) => {
          setLeaveOpen(open);
          if (!open) {
            setLeaveError('');
          }
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>离开当前团队？</AlertDialogTitle>
            <AlertDialogDescription>
              {current
                ? `离开「${current.displayName}」后，将自动切换到你的其他团队。如需重新加入，需由管理员再次邀请。`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {leaveError ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>离开失败</AlertTitle>
              <AlertDescription>{leaveError}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={leaving}>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={leaving}
              onClick={() => {
                void handleLeave();
              }}
            >
              {leaving ? '离开中…' : '离开'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
