import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, Pencil, Plus, RefreshCw, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  assignUserRole,
  fetchRoles,
  fetchTeamMembers,
  fetchUserRoles,
  getStoredTeam,
  getStoredUser,
  inviteTeamMember,
  unassignUserRole,
  type RoleItem,
  type TeamMember,
} from '@/lib/api';
import { hasPermission, Permissions } from '@/lib/permissions';

export default function AdminMembers() {
  const user = getStoredUser();
  const team = getStoredTeam();
  const permissions = user?.permissions ?? [];

  const canInvite = hasPermission(permissions, Permissions.Account.Users.Invite);
  const canEditRoles = hasPermission(permissions, Permissions.Identity.Roles.Update);

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);

  const [rolesOpen, setRolesOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [memberRoleIds, setMemberRoleIds] = useState<string[]>([]);
  const [savingRoles, setSavingRoles] = useState(false);

  const reload = async () => {
    setLoading(true);
    setError('');
    try {
      const [memberList, roleList] = await Promise.all([fetchTeamMembers(), fetchRoles()]);
      setMembers(memberList);
      setRoles(roleList);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
  });

  useEffect(() => {
    const initial = setTimeout(() => {
      void reloadRef.current();
    }, 0);
    return () => {
      clearTimeout(initial);
    };
  }, []);

  const handleInvite = async () => {
    if (!team?.id) {
      setError('请先选择团队');
      return;
    }
    const email = inviteEmail.trim();
    if (!email) {
      setError('请填写邮箱');
      return;
    }
    setInviting(true);
    setError('');
    try {
      await inviteTeamMember({ email, teamId: team.id });
      setInviteOpen(false);
      setInviteEmail('');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : '邀请失败');
    } finally {
      setInviting(false);
    }
  };

  const openEditRoles = async (member: TeamMember) => {
    setEditingMember(member);
    setRolesOpen(true);
    setBusyId(member.id);
    setError('');
    try {
      const assigned = await fetchUserRoles(member.id);
      setMemberRoleIds(assigned.map((role) => role.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载用户角色失败');
      setRolesOpen(false);
      setEditingMember(null);
    } finally {
      setBusyId(null);
    }
  };

  const toggleRole = (roleId: string, checked: boolean) => {
    setMemberRoleIds((prev) => {
      if (checked) {
        if (prev.includes(roleId)) {
          return prev;
        }
        return [...prev, roleId];
      }
      return prev.filter((id) => id !== roleId);
    });
  };

  const handleSaveRoles = async () => {
    if (!editingMember) {
      return;
    }
    setSavingRoles(true);
    setError('');
    try {
      const current = await fetchUserRoles(editingMember.id);
      const currentIds = new Set(current.map((role) => role.id));
      const nextIds = new Set(memberRoleIds);

      for (const roleId of nextIds) {
        if (!currentIds.has(roleId)) {
          await assignUserRole(editingMember.id, roleId);
        }
      }
      for (const roleId of currentIds) {
        if (!nextIds.has(roleId)) {
          await unassignUserRole(editingMember.id, roleId);
        }
      }

      setRolesOpen(false);
      setEditingMember(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存角色失败');
    } finally {
      setSavingRoles(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">成员</h1>
          <p className="text-sm text-muted-foreground">查看当前团队成员，邀请已有用户入队并分配角色</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => {
              void reload();
            }}
          >
            <RefreshCw data-icon="inline-start" />
            刷新
          </Button>
          {canInvite ? (
            <Button
              size="sm"
              onClick={() => {
                setInviteOpen(true);
              }}
            >
              <Plus data-icon="inline-start" />
              邀请成员
            </Button>
          ) : null}
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {loading ? (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>用户名</TableHead>
                <TableHead>邮箱</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="w-12 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-40" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-12" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="ml-auto h-8 w-8" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : members.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Users />
            </EmptyMedia>
            <EmptyTitle>暂无成员</EmptyTitle>
            <EmptyDescription>{canInvite ? '邀请已存在的用户加入当前团队。' : '当前团队还没有可见成员。'}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>用户名</TableHead>
                <TableHead>邮箱</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="w-12 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">{member.username}</TableCell>
                  <TableCell className="text-muted-foreground">{member.email}</TableCell>
                  <TableCell>
                    <Badge variant={member.active ? 'default' : 'outline'}>{member.active ? '启用' : '停用'}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {canEditRoles ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" disabled={busyId === member.id} />}>
                          <MoreHorizontal />
                          <span className="sr-only">操作</span>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuGroup>
                            <DropdownMenuItem
                              onClick={() => {
                                void openEditRoles(member);
                              }}
                            >
                              <Pencil />
                              编辑角色
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>邀请成员</DialogTitle>
            <DialogDescription>输入已存在用户的邮箱，将其加入当前团队。</DialogDescription>
          </DialogHeader>
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="invite-email">邮箱</FieldLabel>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(event) => {
                  setInviteEmail(event.target.value);
                }}
                placeholder="user@example.com"
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setInviteOpen(false);
              }}
            >
              取消
            </Button>
            <Button
              disabled={inviting}
              onClick={() => {
                void handleInvite();
              }}
            >
              {inviting ? <Spinner data-icon="inline-start" /> : null}
              {inviting ? '邀请中…' : '邀请'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={rolesOpen}
        onOpenChange={(open) => {
          setRolesOpen(open);
          if (!open) {
            setEditingMember(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑角色</DialogTitle>
            <DialogDescription>
              {editingMember ? `为 ${editingMember.username}（${editingMember.email}）分配当前团队角色` : '分配当前团队角色'}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="gap-3">
            {roles.length === 0 ? (
              <p className="text-sm text-muted-foreground">当前团队暂无角色</p>
            ) : (
              roles.map((role) => {
                const checked = memberRoleIds.includes(role.id);
                return (
                  <FieldLabel key={role.id} className="cursor-pointer items-start rounded-lg border p-3 text-sm">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(value) => {
                        toggleRole(role.id, !!value);
                      }}
                    />
                    <span>
                      <span className="font-medium">{role.name}</span>
                      <FieldDescription>{role.permissions.length} 项权限</FieldDescription>
                    </span>
                  </FieldLabel>
                );
              })
            )}
          </FieldGroup>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRolesOpen(false);
              }}
            >
              取消
            </Button>
            <Button
              disabled={savingRoles || !editingMember}
              onClick={() => {
                void handleSaveRoles();
              }}
            >
              {savingRoles ? <Spinner data-icon="inline-start" /> : null}
              {savingRoles ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
