import { useState } from 'react';
import { AgentNeededDialog } from '@/components/AgentNeededDialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAgent } from '@/hooks/use-agent';
import { cn } from '@/lib/utils';

const STATUS_LABEL = {
  connected: 'Agent',
  connecting: 'Agent',
  disconnected: 'Agent 未连接',
} as const;

export function AgentStatusBadge({ className }: { className?: string }) {
  const { status, version } = useAgent();
  const [detailOpen, setDetailOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const label = STATUS_LABEL[status];
  const tooltip =
    status === 'connected'
      ? version
        ? `桌面 Agent 已连接 · v${version}`
        : '桌面 Agent 已连接'
      : status === 'connecting'
        ? '正在连接本机 Agent…'
        : '桌面 Agent 未连接，点击查看说明';

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                'h-auto gap-2 px-2 py-1 text-xs font-normal text-muted-foreground hover:text-foreground',
                status === 'disconnected' && 'text-foreground',
                className,
              )}
              aria-label={tooltip}
              onClick={() => {
                if (status === 'connected') {
                  setDetailOpen(true);
                  return;
                }
                setHelpOpen(true);
              }}
            />
          }
        >
          {status === 'connecting' ? (
            <Spinner className="size-3 text-muted-foreground" aria-label="正在连接" />
          ) : (
            <span
              className={cn('size-1.5 shrink-0 rounded-full', {
                'bg-primary': status === 'connected',
                'bg-muted-foreground/50': status === 'disconnected',
              })}
            />
          )}
          <span>{label}</span>
        </TooltipTrigger>
        <TooltipContent side="bottom">{tooltip}</TooltipContent>
      </Tooltip>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>桌面 Agent 已连接</DialogTitle>
            <DialogDescription>
              可用于授权媒体账号、重新授权，以及打开创作者中心。
              {version ? ` 当前版本 v${version}。` : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => {
                setDetailOpen(false);
              }}
            >
              知道了
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AgentNeededDialog
        open={helpOpen}
        onOpenChange={setHelpOpen}
        connecting={status === 'connecting'}
      />
    </>
  );
}
