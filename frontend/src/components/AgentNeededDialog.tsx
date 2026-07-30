import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type AgentNeededDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** True while the SPA is still trying to reach the local Agent. */
  connecting?: boolean;
};

export function AgentNeededDialog({ open, onOpenChange, connecting = false }: AgentNeededDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{connecting ? '正在连接桌面 Agent' : '需要打开桌面 Agent'}</DialogTitle>
          <DialogDescription>
            {connecting
              ? '正在连接本机「蒲公英 Agent」。请确认菜单栏 / 托盘中的 Agent 已打开，连接成功后可继续授权或查看创作者中心。'
              : '添加账号、重新授权或查看创作者中心需要本机「蒲公英 Agent」。请打开菜单栏 / 托盘中的 Agent，连接成功后再试。'}
          </DialogDescription>
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
