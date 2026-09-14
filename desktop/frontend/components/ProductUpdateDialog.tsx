/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, type ReactNode } from 'react';
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

type ProductUpdateContextValue = ReturnType<typeof useProductUpdateCheck>;

const ProductUpdateContext = createContext<ProductUpdateContextValue | null>(null);

export function useProductUpdate(): ProductUpdateContextValue {
  const ctx = useContext(ProductUpdateContext);
  if (!ctx) {
    throw new Error('useProductUpdate must be used within ProductUpdateProvider');
  }
  return ctx;
}

type DialogCopy = {
  title: string;
  body: string;
  hint?: string;
  secondaryLabel: string;
  primaryLabel?: string;
};

/** 按场景给出一句主文案，避免多段说明抬高理解成本 */
function resolveDialogCopy(state: ProductUpdateContextValue): DialogCopy {
  const {
    checking,
    localVersion,
    remoteVersion,
    spaUpdateAvailable,
    chunkStale,
    agentUpdateNeeded,
    minAgentVersion,
  } = state;

  if (checking && !remoteVersion && !chunkStale) {
    return {
      title: '正在检查更新',
      body: '请稍候…',
      secondaryLabel: '关闭',
    };
  }

  if (spaUpdateAvailable && remoteVersion) {
    return {
      title: '发现新版本',
      body: `可以更新到 v${remoteVersion}。更新只需片刻，完成后即可继续使用。`,
      hint: agentUpdateNeeded && minAgentVersion
        ? `若更新后仍异常，请安装蒲公英 v${minAgentVersion} 及以上并重新打开。`
        : `当前为 v${localVersion}`,
      secondaryLabel: '以后再说',
      primaryLabel: '立即更新',
    };
  }

  if (chunkStale) {
    return {
      title: '需要重新加载',
      body: '当前页面已过期，重新加载后即可继续。',
      secondaryLabel: '以后再说',
      primaryLabel: '立即重新加载',
    };
  }

  if (agentUpdateNeeded && minAgentVersion) {
    return {
      title: '需要升级应用',
      body: `请安装蒲公英 v${minAgentVersion} 及以上，然后重新打开。`,
      hint: `当前为 v${localVersion}`,
      secondaryLabel: '知道了',
    };
  }

  return {
    title: '已是最新版本',
    body: `当前为 v${localVersion}，无需更新。`,
    secondaryLabel: '知道了',
  };
}

function ProductUpdateDialogView(state: ProductUpdateContextValue) {
  const { open, dismiss, refresh } = state;
  const copy = resolveDialogCopy(state);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          dismiss();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.body}</DialogDescription>
          {copy.hint ? (
            <p className="text-xs text-muted-foreground">{copy.hint}</p>
          ) : null}
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={dismiss}>
            {copy.secondaryLabel}
          </Button>
          {copy.primaryLabel ? (
            <Button type="button" onClick={refresh}>
              <RefreshCw data-icon="inline-start" />
              {copy.primaryLabel}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 统一发版检查：弹窗 + 供侧栏版本号打开的上下文 */
export function ProductUpdateProvider({ children }: { children: ReactNode }) {
  const value = useProductUpdateCheck();
  return (
    <ProductUpdateContext.Provider value={value}>
      {children}
      <ProductUpdateDialogView {...value} />
    </ProductUpdateContext.Provider>
  );
}
