import { useState } from 'react';
import { AlertCircle, Building2, Check, LogOut } from 'lucide-react';

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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { useTeam } from '@/hooks/use-team';
import { getStoredUser } from '@/lib/api';
import { hasPermission, Permissions } from '@/lib/permissions';

/**
 * 用户信息即团队切换入口：顶部头像/姓名/邮箱作为 SubTrigger，点击展开团队列表与离开当前团队。
 */
export function NavUserTeamMenu({
  user,
}: {
  user: {
    name: string;
    email: string;
    avatar: string;
  };
}) {
  const { teams, current, switchTo, leaveCurrent } = useTeam();
  const permissions = getStoredUser()?.permissions ?? [];
  const canLeave = hasPermission(permissions, Permissions.Account.Users.Leave);
  const canLeaveCurrent = canLeave && !!current && teams.length > 1;

  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState('');

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
      <DropdownMenuSub>
        {/* 样式对齐原 Label，但可展开二级团队菜单 */}
        <DropdownMenuSubTrigger
          className="mx-1 gap-2 rounded-md p-0 font-normal focus:bg-accent data-open:bg-accent"
          aria-label={current ? `切换团队，当前 ${current.displayName}` : '切换团队'}
        >
          <div className="flex flex-1 items-center gap-2 px-1 py-1.5 text-left text-sm">
            <Avatar className="size-8 rounded-lg">
              <AvatarImage src={user.avatar} alt={user.name} />
              <AvatarFallback className="rounded-lg">PU</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{user.name}</span>
              <span className="truncate text-xs">{user.email}</span>
            </div>
          </div>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="min-w-48">
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
              {team.id === current?.id ? <Check className="ml-auto size-4" /> : null}
            </DropdownMenuItem>
          ))}
          {canLeaveCurrent ? (
            <>
              <DropdownMenuSeparator />
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
            </>
          ) : null}
        </DropdownMenuSubContent>
      </DropdownMenuSub>

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
