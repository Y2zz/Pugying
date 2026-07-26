import { AgentStatusBadge } from '@/components/AgentStatusBadge';
import { useAgent } from '@/hooks/use-agent';
import { getStoredTeam, getStoredUser } from '@/lib/api';

export default function AdminOverview() {
  const user = getStoredUser();
  const team = getStoredTeam();
  const { status, version, capabilities } = useAgent();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">管理概览</h1>
        <p className="text-sm text-muted-foreground">
          团队管理与桌面 Agent 连接状态
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="space-y-2 rounded-lg border p-4">
          <h2 className="text-sm font-medium">当前团队</h2>
          <p className="text-lg font-semibold">
            {team?.displayName ?? '未选择团队'}
          </p>
          <p className="text-xs text-muted-foreground">
            {team?.name ? `标识：${team.name}` : null}
          </p>
          <p className="text-xs text-muted-foreground">
            登录用户：{user?.email ?? '—'}
          </p>
        </section>

        <section className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium">桌面 Agent</h2>
            <AgentStatusBadge />
          </div>
          <dl className="space-y-1 text-sm text-muted-foreground">
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
              <dd className="text-right">
                {capabilities.length > 0 ? capabilities.join(', ') : '—'}
              </dd>
            </div>
          </dl>
          {status !== 'connected' ? (
            <p className="text-xs text-muted-foreground">
              请在本机运行{' '}
              <code className="rounded bg-muted px-1">cd agent && npm run dev</code>
              ，前端会自动重连 ws://127.0.0.1:3927
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
