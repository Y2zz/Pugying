import { useState } from 'react';
import { Monitor } from 'lucide-react';
import { AgentNeededPopoverContent } from '@/components/AgentNeededDialog';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAgent } from '@/hooks/use-agent';
import { cn } from '@/lib/utils';

const STATUS_LABEL = {
  connected: 'Agent',
  connecting: 'Agent',
  disconnected: 'Agent 未连接',
} as const;

type AgentStatusBadgeProps = {
  className?: string;
  /** header：顶栏幽灵按钮；sidebar：侧栏底栏菜单项（本机环境，与用户区相邻） */
  placement?: 'header' | 'sidebar';
};

function AgentConnectedPopoverContent({ version }: { version: string | null }) {
  return (
    <PopoverHeader className="gap-2">
      <PopoverTitle>桌面 Agent 已连接</PopoverTitle>
      <PopoverDescription>
        可用于授权媒体账号、重新授权、发布重试，以及打开创作者中心。
      </PopoverDescription>
      {version ? <p className="text-xs text-muted-foreground">当前版本 v{version}</p> : null}
    </PopoverHeader>
  );
}

export function AgentStatusBadge({ className, placement = 'header' }: AgentStatusBadgeProps) {
  const { status, version } = useAgent();
  const [open, setOpen] = useState(false);

  const label = STATUS_LABEL[status];
  const tooltip =
    status === 'connected'
      ? version
        ? `桌面 Agent 已连接 · v${version}`
        : '桌面 Agent 已连接'
      : status === 'connecting'
        ? '正在连接本机 Agent…'
        : '桌面 Agent 未连接，点击查看说明';

  const popoverSide = placement === 'sidebar' ? 'right' : 'bottom';
  const popoverAlign = placement === 'sidebar' ? 'start' : 'end';

  const popoverBody =
    status === 'connected' ? (
      <AgentConnectedPopoverContent version={version} />
    ) : (
      <AgentNeededPopoverContent connecting={status === 'connecting'} />
    );

  const statusDot =
    status === 'connecting' ? (
      <Spinner className="size-3 shrink-0 text-muted-foreground" aria-label="正在连接" />
    ) : (
      <span
        className={cn('size-1.5 shrink-0 rounded-full', {
          'bg-primary': status === 'connected',
          'bg-muted-foreground/50': status === 'disconnected',
        })}
      />
    );

  if (placement === 'sidebar') {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <SidebarMenu>
          <SidebarMenuItem>
            <PopoverTrigger
              render={
                <SidebarMenuButton
                  tooltip={tooltip}
                  className={cn(
                    status === 'connected' && 'text-sidebar-foreground/70',
                    status === 'disconnected' && 'text-sidebar-foreground',
                    className,
                  )}
                  aria-label={tooltip}
                />
              }
            >
              {status === 'connecting' ? (
                <Spinner className="size-4 shrink-0" aria-label="正在连接" />
              ) : (
                <Monitor />
              )}
              <span>{label}</span>
              {status === 'connected' ? (
                <span
                  aria-hidden
                  className="ml-auto size-1.5 shrink-0 rounded-full bg-primary group-data-[collapsible=icon]:hidden"
                />
              ) : null}
            </PopoverTrigger>
          </SidebarMenuItem>
        </SidebarMenu>
        <PopoverContent className="w-80" side={popoverSide} align={popoverAlign}>
          {popoverBody}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Tooltip>
      <Popover open={open} onOpenChange={setOpen}>
        <TooltipTrigger
          render={
            <PopoverTrigger
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
                />
              }
            />
          }
        >
          {statusDot}
          <span>{label}</span>
        </TooltipTrigger>
        <PopoverContent className="w-80" side={popoverSide} align={popoverAlign}>
          {popoverBody}
        </PopoverContent>
      </Popover>
      <TooltipContent side="bottom">{tooltip}</TooltipContent>
    </Tooltip>
  );
}
