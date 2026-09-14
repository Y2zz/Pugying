import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { PlatformAccountItem } from '@/lib/api';
import { DistributionAccountRow, distributionAccountDraftOrEmpty } from './DistributionAccountRow';
import type { OverrideDraft } from './helpers';

export type DistributionAccountEntry = {
  account: PlatformAccountItem;
  platformLabel: string;
};

/**
 * 主从布局左侧：在父级分配的高度内滚动（10+ 同平台账号）。
 * 仅渲染行摘要，表单在 DistributionAccountEditor 中单例展示。
 */
export function DistributionAccountList({
  entries,
  drafts,
  focusedAccountId,
  disabled,
  onFocusAccount,
  onRemoveAccount,
  className,
}: {
  entries: DistributionAccountEntry[];
  drafts: Record<string, OverrideDraft>;
  focusedAccountId: string | null;
  disabled?: boolean;
  onFocusAccount: (accountId: string) => void;
  onRemoveAccount: (accountId: string) => void;
  className?: string;
}) {
  return (
    <ScrollArea className={cn('min-h-[200px] rounded-lg border bg-muted/20 lg:min-h-0 lg:h-full', className)}>
      <div className="flex flex-col gap-1.5 p-2">
        {entries.map(({ account }) => (
          <DistributionAccountRow
            key={account.id}
            account={account}
            draft={distributionAccountDraftOrEmpty(drafts, account.id)}
            focused={focusedAccountId === account.id}
            disabled={disabled}
            onFocus={() => {
              onFocusAccount(account.id);
            }}
            onRemove={() => {
              onRemoveAccount(account.id);
            }}
          />
        ))}
      </div>
    </ScrollArea>
  );
}
