import { useEffect, useRef, useState } from 'react';
import { Pencil, Plus, RefreshCw, Shield, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { createRole, deleteRole, fetchPermissionCatalog, fetchRoles, getStoredTeam, getStoredUser, updateRole, type RoleItem } from '@/lib/api';
import { hasPermission, Permissions } from '@/lib/permissions';

function groupPermissions(catalog: string[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const name of catalog) {
    const moduleName = name.split('.')[0] ?? 'Other';
    if (!groups[moduleName]) {
      groups[moduleName] = [];
    }
    groups[moduleName].push(name);
  }
  return groups;
}

export default function AdminRoles() {
  const user = getStoredUser();
  const team = getStoredTeam();
  const permissions = user?.permissions ?? [];

  const canCreate = hasPermission(permissions, Permissions.Identity.Roles.Create);
  const canUpdate = hasPermission(permissions, Permissions.Identity.Roles.Update);
  const canDelete = hasPermission(permissions, Permissions.Identity.Roles.Delete);

  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [catalog, setCatalog] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RoleItem | null>(null);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    setLoading(true);
    setError('');
    try {
      const [roleList, permissionList] = await Promise.all([fetchRoles(), fetchPermissionCatalog()]);
      setRoles(roleList);
      setCatalog(permissionList);
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

  const openCreate = () => {
    setEditing(null);
    setName('');
    setSelected([]);
    setDialogOpen(true);
  };

  const openEdit = (role: RoleItem) => {
    setEditing(role);
    setName(role.name);
    setSelected([...role.permissions]);
    setDialogOpen(true);
  };

  const togglePermission = (permission: string, checked: boolean) => {
    setSelected((prev) => {
      if (checked) {
        if (prev.includes(permission)) {
          return prev;
        }
        return [...prev, permission];
      }
      return prev.filter((item) => item !== permission);
    });
  };

  const handleSave = async () => {
    if (!team?.id) {
      setError('请先选择团队');
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      setError('请填写角色名');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editing) {
        await updateRole(editing.id, {
          name: trimmed,
          permissions: selected,
        });
      } else {
        await createRole({
          name: trimmed,
          teamId: team.id,
          permissions: selected,
        });
      }
      setDialogOpen(false);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (role: RoleItem) => {
    if (!window.confirm(`确定删除角色「${role.name}」？`)) {
      return;
    }
    setBusyId(role.id);
    setError('');
    try {
      await deleteRole(role.id);
      setRoles((prev) => prev.filter((item) => item.id !== role.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setBusyId(null);
    }
  };

  const groups = groupPermissions(catalog);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">角色</h1>
          <p className="text-sm text-muted-foreground">管理当前团队的角色及其权限</p>
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
          {canCreate ? (
            <Button
              size="sm"
              onClick={() => {
                openCreate();
              }}
            >
              <Plus data-icon="inline-start" />
              新建角色
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
                <TableHead>角色名</TableHead>
                <TableHead>权限</TableHead>
                <TableHead className="w-44 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-48" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="ml-auto h-8 w-32" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : roles.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Shield />
            </EmptyMedia>
            <EmptyTitle>暂无角色</EmptyTitle>
            <EmptyDescription>{canCreate ? '点击「新建角色」创建第一个角色。' : '当前团队还没有角色。'}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>角色名</TableHead>
                <TableHead>权限</TableHead>
                <TableHead className="w-44 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map((role) => (
                <TableRow key={role.id}>
                  <TableCell className="font-medium">{role.name}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="mr-1 text-xs text-muted-foreground">{role.permissions.length} 项</span>
                      {role.permissions.slice(0, 3).map((permission) => (
                        <Badge key={permission} variant="secondary" className="max-w-40 truncate text-[10px]">
                          {permission}
                        </Badge>
                      ))}
                      {role.permissions.length > 3 ? (
                        <Badge variant="outline" className="text-[10px]">
                          +{role.permissions.length - 3}
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {canUpdate || canDelete ? (
                      <div className="flex justify-end gap-1">
                        {canUpdate ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busyId === role.id}
                            onClick={() => {
                              openEdit(role);
                            }}
                          >
                            <Pencil data-icon="inline-start" />
                            编辑
                          </Button>
                        ) : null}
                        {canDelete ? (
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={busyId === role.id}
                            onClick={() => {
                              void handleDelete(role);
                            }}
                          >
                            <Trash2 data-icon="inline-start" />
                            删除
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? '编辑角色' : '新建角色'}</DialogTitle>
            <DialogDescription>勾选该角色应拥有的权限。权限按模块分组展示。</DialogDescription>
          </DialogHeader>
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="role-name">角色名</FieldLabel>
              <Input
                id="role-name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                }}
                placeholder="例如 editor"
              />
            </Field>
            <FieldSet>
              <FieldLegend variant="label">权限</FieldLegend>
              <div className="flex flex-col gap-3">
                {Object.entries(groups).map(([moduleName, items]) => (
                  <div key={moduleName} className="flex flex-col gap-2 rounded-lg border p-3">
                    <p className="text-sm font-medium">{moduleName}</p>
                    <div className="flex flex-col gap-2">
                      {items.map((permission) => {
                        const checked = selected.includes(permission);
                        return (
                          <FieldLabel key={permission} className="cursor-pointer items-start text-sm">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(value) => {
                                togglePermission(permission, !!value);
                              }}
                            />
                            <span className="leading-5 break-all">{permission}</span>
                          </FieldLabel>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </FieldSet>
          </FieldGroup>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDialogOpen(false);
              }}
            >
              取消
            </Button>
            <Button
              disabled={saving}
              onClick={() => {
                void handleSave();
              }}
            >
              {saving ? <Spinner data-icon="inline-start" /> : null}
              {saving ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
