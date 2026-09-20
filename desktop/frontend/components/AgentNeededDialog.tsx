import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getPugyingDesktopBridge } from '@/lib/agent-client';

type AgentNeededCopy = {
  title: string;
  description: string;
};

/** 未连接 / 连接中时的说明文案（能力已并入桌面应用，不再提独立 Agent） */
export function getAgentNeededCopy(connecting: boolean): AgentNeededCopy {
  // 桌面主窗内能力走 IPC，正常不应长期断开；提示侧重重启而非「另装」
  if (getPugyingDesktopBridge()) {
    if (connecting) {
      return {
        title: '正在初始化',
        description: '应用能力正在就绪，请稍候。',
      };
    }
    return {
      title: '应用未就绪',
      description: '请重启「蒲公英」后再试。',
    };
  }

  if (connecting) {
    return {
      title: '正在连接',
      description:
        '正在连接蒲公英桌面应用。请确认已从桌面应用打开本界面（而非仅用浏览器），连接成功后可继续授权或查看创作者中心。',
    };
  }
  return {
    title: '需要从桌面端打开',
    description:
      '添加账号、重新授权或查看创作者中心需要在「蒲公英」桌面应用中打开本界面后再试。',
  };
}

type AgentNeededDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** True while the SPA is still trying to reach desktop capabilities. */
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
