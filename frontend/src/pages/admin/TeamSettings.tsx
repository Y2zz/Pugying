import { useEffect, useRef, useState } from 'react';
import { PageHeader } from '@/components/layouts/PageHeader';
import { Button } from '@/components/ui/button';
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { fetchTeam, getStoredTeam, getStoredUser, setStoredTeam, updateTeam, type TeamDetail } from '@/lib/api';
import { hasPermission, Permissions } from '@/lib/permissions';

export default function AdminTeamSettings() {
  const user = getStoredUser();
  const storedTeam = getStoredTeam();
  const permissions = user?.permissions ?? [];
  const canUpdate = hasPermission(permissions, Permissions.TeamManagement.Teams.Update);

  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [name, setName] = useState('');
  const [active, setActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const reload = async () => {
    if (!storedTeam?.id) {
      setLoading(false);
      setError('请先选择团队');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const detail = await fetchTeam(storedTeam.id);
      setTeam(detail);
      setDisplayName(detail.displayName);
      setName(detail.name);
      setActive(detail.active);
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

  const handleSave = async () => {
    if (!team) {
      return;
    }
    const nextDisplayName = displayName.trim();
    const nextName = name.trim();
    if (!nextDisplayName || !nextName) {
      setError('显示名称与标识不能为空');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const updated = await updateTeam(team.id, {
        displayName: nextDisplayName,
        name: nextName,
        active,
      });
      setTeam(updated);
      setDisplayName(updated.displayName);
      setName(updated.name);
      setActive(updated.active);
      setStoredTeam({
        id: updated.id,
        name: updated.name,
        displayName: updated.displayName,
      });
      setSuccess('团队设置已保存');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="团队设置" description="更新当前团队的显示名称、标识与启用状态" />

      {error ? <FieldError>{error}</FieldError> : null}
      {success ? <p className="text-muted-foreground">{success}</p> : null}

      {loading ? (
        <p className="text-muted-foreground">加载中…</p>
      ) : !team ? (
        <p className="text-muted-foreground">无法加载团队信息</p>
      ) : (
        <section className="max-w-lg rounded-lg border p-4">
          <FieldGroup className="gap-4">
            <Field data-disabled={!canUpdate ? true : undefined}>
              <FieldLabel htmlFor="team-display-name">显示名称</FieldLabel>
              <Input
                id="team-display-name"
                value={displayName}
                disabled={!canUpdate}
                onChange={(event) => {
                  setDisplayName(event.target.value);
                }}
              />
            </Field>
            <Field data-disabled={!canUpdate ? true : undefined}>
              <FieldLabel htmlFor="team-name">标识</FieldLabel>
              <Input
                id="team-name"
                value={name}
                disabled={!canUpdate}
                onChange={(event) => {
                  setName(event.target.value);
                }}
              />
              <FieldDescription>团队唯一标识，通常为小写字母与连字符</FieldDescription>
            </Field>
            <Field orientation="horizontal" data-disabled={!canUpdate ? true : undefined} className="rounded-lg border px-3 py-2">
              <FieldContent>
                <FieldLabel htmlFor="team-active">启用团队</FieldLabel>
                <FieldDescription>停用后成员将无法继续使用该团队</FieldDescription>
              </FieldContent>
              <Switch
                id="team-active"
                checked={active}
                disabled={!canUpdate}
                onCheckedChange={(value) => {
                  setActive(!!value);
                }}
              />
            </Field>
            {canUpdate ? (
              <Button
                disabled={saving}
                onClick={() => {
                  void handleSave();
                }}
              >
                {saving ? <Spinner data-icon="inline-start" /> : null}
                {saving ? '保存中…' : '保存'}
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">你没有更新团队的权限（TeamManagement.Teams.Update）</p>
            )}
          </FieldGroup>
        </section>
      )}
    </div>
  );
}
