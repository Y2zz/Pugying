import { useEffect, useRef, useState } from 'react';
import { AgentStatusBadge } from '@/components/AgentStatusBadge';
import { useAgent } from '@/hooks/use-agent';
import { fetchContents, fetchPlatformAccounts, fetchRoles, fetchTeamMembers, getStoredTeam, getStoredUser } from '@/lib/api';
import { hasPermission, Permissions } from '@/lib/permissions';

interface OverviewCounts {
  members: number | null;
  roles: number | null;
  accounts: number | null;
  contents: number | null;
}

const EMPTY_COUNTS: OverviewCounts = {
  members: null,
  roles: null,
  accounts: null,
  contents: null,
};

function formatCount(value: number | null): string {
  if (value === null) {
    return '—';
  }
  return String(value);
}

export default function AdminOverview() {
  const user = getStoredUser();
  const team = getStoredTeam();
  const { status, version, capabilities } = useAgent();
  const permissions = user?.permissions ?? [];

  const [counts, setCounts] = useState<OverviewCounts>(EMPTY_COUNTS);
  const [countsError, setCountsError] = useState('');

  const loadCounts = async () => {
    setCountsError('');
    const next: OverviewCounts = { ...EMPTY_COUNTS };

    const tasks: Array<Promise<void>> = [];

    if (hasPermission(permissions, Permissions.Identity.Users.View)) {
      tasks.push(
        fetchTeamMembers()
          .then((list) => {
            next.members = list.length;
          })
          .catch(() => {
            next.members = null;
          })
      );
    }

    if (hasPermission(permissions, Permissions.Identity.Roles.View)) {
      tasks.push(
        fetchRoles()
          .then((list) => {
            next.roles = list.length;
          })
          .catch(() => {
            next.roles = null;
          })
      );
    }

    tasks.push(
      fetchPlatformAccounts()
        .then((list) => {
          next.accounts = list.length;
        })
        .catch(() => {
          next.accounts = null;
        })
    );

    tasks.push(
      fetchContents()
        .then((list) => {
          next.contents = list.length;
        })
        .catch(() => {
          next.contents = null;
        })
    );

    await Promise.all(tasks);
    setCounts(next);
    if (next.members === null && next.roles === null && next.accounts === null && next.contents === null) {
      setCountsError('部分统计未能加载（可能缺少权限）');
    }
  };

  const loadCountsRef = useRef(loadCounts);
  useEffect(() => {
    loadCountsRef.current = loadCounts;
  });

  useEffect(() => {
    const initial = setTimeout(() => {
      void loadCountsRef.current();
    }, 0);
    return () => {
      clearTimeout(initial);
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">管理概览</h1>
        <p className="text-sm text-muted-foreground">团队管理与桌面 Agent 连接状态</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="flex flex-col gap-2 rounded-lg border p-4">
          <h2 className="text-sm font-medium">当前团队</h2>
          <p className="text-lg font-semibold">{team?.displayName ?? '未选择团队'}</p>
          <p className="text-xs text-muted-foreground">{team?.name ? `标识：${team.name}` : null}</p>
          <p className="text-xs text-muted-foreground">登录用户：{user?.email ?? '—'}</p>
        </section>

        <section className="flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium">桌面 Agent</h2>
            <AgentStatusBadge />
          </div>
          <dl className="flex flex-col gap-1 text-sm text-muted-foreground">
            <div className="flex justify-between gap-4">
              <dt>状态</dt>
              <dd>{status}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>版本</dt>
              <dd>{version ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>能力</dt>
              <dd className="text-right">{capabilities.length > 0 ? capabilities.join(', ') : '—'}</dd>
            </div>
          </dl>
          {status !== 'connected' ? (
            <p className="text-xs text-muted-foreground">
              请在本机运行 <code className="rounded bg-muted px-1">cd agent && npm run dev</code>
              ，前端会自动重连 ws://127.0.0.1:3927
            </p>
          ) : null}
        </section>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium">资源统计</h2>
        {countsError ? <p className="mb-2 text-xs text-muted-foreground">{countsError}</p> : null}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="成员" value={formatCount(counts.members)} />
          <StatCard label="角色" value={formatCount(counts.roles)} />
          <StatCard label="媒体账号" value={formatCount(counts.accounts)} />
          <StatCard label="内容" value={formatCount(counts.contents)} />
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <section className="rounded-lg border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
    </section>
  );
}
