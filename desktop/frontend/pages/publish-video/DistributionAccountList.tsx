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
 * 主从布局左侧：账号行列表。
 * plain（图文轨）：轻量 overflow，避免 ScrollArea 再套一层视口壳。
 */
export function DistributionAccountList({
  entries,
  drafts,
  focusedAccountId,
  disabled,
  onFocusAccount,
  onRemoveAccount,
  className,
  /** 无外框/行描边，用底色表达选中（图文页减线） */
  plain = false,
  /** 覆盖计数；不传则用视频默认视频计数 */
  getOverrideCount,
  overrideLabel,
  getIssues,
}: {
  entries: DistributionAccountEntry[];
  drafts: Record<string, OverrideDraft>;
  focusedAccountId: string | null;
  disabled?: boolean;
  onFocusAccount: (accountId: string) => void;
  onRemoveAccount: (accountId: string) => void;
  className?: string;
  plain?: boolean;
  getOverrideCount?: (draft: OverrideDraft) => number;
  overrideLabel?: string;
  getIssues?: (draft: OverrideDraft, account: PlatformAccountItem) => string[];
}) {
  const rows = entries.map(({ account }) => {
    const draft = distributionAccountDraftOrEmpty(drafts, account.id);
    return (
      <DistributionAccountRow
        key={account.id}
        account={account}
        draft={draft}
        focused={focusedAccountId === account.id}
        disabled={disabled}
        plain={plain}
        overrideCount={getOverrideCount ? getOverrideCount(draft) : undefined}
        overrideLabel={overrideLabel}
        issues={getIssues ? getIssues(draft, account) : undefined}
        onFocus={() => {
          onFocusAccount(account.id);
        }}
        onRemove={() => {
          onRemoveAccount(account.id);
        }}
      />
    );
  });

  if (plain) {
    return (
      <div
        className={cn(
          'flex max-h-[min(28rem,55vh)] flex-col gap-0.5 overflow-y-auto',
          className,
        )}
      >
        {rows}
      </div>
    );
  }

  return (
    <ScrollArea
      className={cn('min-h-[200px] rounded-lg border bg-muted/20 lg:h-full lg:min-h-0', className)}
    >
      <div className="flex flex-col gap-1.5 p-2">{rows}</div>
    </ScrollArea>
  );
}
