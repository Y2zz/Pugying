import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useProductUpdateCheck } from '@/hooks/use-product-update-check';

/** 统一发版后向管理区运维人员弹窗提示刷新；挂载于 AdminLayout */
export function ProductUpdateDialog() {
  const {
    showDialog,
    remoteVersion,
    spaUpdateAvailable,
    agentUpdateNeeded,
    minAgentVersion,
    dismiss,
    refresh,
  } = useProductUpdateCheck();

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      dismiss();
    }
  };

  return (
    <Dialog open={showDialog} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>产品已更新</DialogTitle>
          {spaUpdateAvailable && remoteVersion ? (
            <DialogDescription>
              蒲公英已更新至 <span className="font-medium text-foreground">v{remoteVersion}</span>
              ，请刷新管理端页面以加载新版本前端资源。
            </DialogDescription>
          ) : (
            <DialogDescription>管理端页面资源已过期，请刷新后继续操作。</DialogDescription>
          )}
          {agentUpdateNeeded && minAgentVersion ? (
            <DialogDescription>
              当前连接的桌面 Agent 版本较低，请通知使用者重启或升级至 v{minAgentVersion} 及以上。
            </DialogDescription>
          ) : null}
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={dismiss}>
            稍后
          </Button>
          <Button type="button" onClick={refresh}>
            <RefreshCw data-icon="inline-start" />
            立即刷新
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
