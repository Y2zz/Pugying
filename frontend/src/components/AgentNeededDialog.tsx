import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
} from '@/components/ui/popover';

type AgentNeededCopy = {
  title: string;
  description: string;
};

/** 未连接 / 连接中时的说明文案（Popover 与 Dialog 共用） */
export function getAgentNeededCopy(connecting: boolean): AgentNeededCopy {
  if (connecting) {
    return {
      title: '正在连接桌面 Agent',
      description:
        '正在连接本机「蒲公英 Agent」。请确认菜单栏 / 托盘中的 Agent 已打开，连接成功后可继续授权或查看创作者中心。',
    };
  }
  return {
    title: '需要打开桌面 Agent',
    description:
      '添加账号、重新授权或查看创作者中心需要本机「蒲公英 Agent」。请打开菜单栏 / 托盘中的 Agent，连接成功后再试。',
  };
}

/** 侧栏/顶栏 Popover 用的轻量说明块 */
export function AgentNeededPopoverContent({ connecting = false }: { connecting?: boolean }) {
  const copy = getAgentNeededCopy(connecting);
  return (
    <PopoverHeader className="gap-2">
      <PopoverTitle>{copy.title}</PopoverTitle>
      <PopoverDescription>{copy.description}</PopoverDescription>
    </PopoverHeader>
  );
}

type AgentNeededDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** True while the SPA is still trying to reach the local Agent. */
  connecting?: boolean;
};

/** 业务操作拦截场景：仍需模态确认时用 Dialog */
export function AgentNeededDialog({ open, onOpenChange, connecting = false }: AgentNeededDialogProps) {
  const copy = getAgentNeededCopy(connecting);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            onClick={() => {
              onOpenChange(false);
            }}
          >
            知道了
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
