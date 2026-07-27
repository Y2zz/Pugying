import { useAgent } from '@/hooks/use-agent';
import { cn } from '@/lib/utils';

const statusLabel: Record<string, string> = {
  connected: 'Agent 已连接',
  connecting: 'Agent 连接中…',
  disconnected: 'Agent 未连接',
};

export function AgentStatusBadge({ className }: { className?: string }) {
  const { status, version } = useAgent();

  return (
    <div
      className={cn('flex items-center gap-2 rounded-md border px-2 py-1 text-xs text-muted-foreground', className)}
      title={version ? `Agent ${version}` : 'Pugying Agent'}
    >
      <span
        className={cn('size-1.5 rounded-full', {
          'bg-primary': status === 'connected',
          'bg-muted-foreground': status === 'connecting',
          'bg-muted-foreground/40': status === 'disconnected',
        })}
      />
      <span>{statusLabel[status] ?? status}</span>
    </div>
  );
}
