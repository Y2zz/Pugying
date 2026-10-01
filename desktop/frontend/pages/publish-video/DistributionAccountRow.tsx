import { X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { PlatformAccountItem } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  ACCOUNT_STATUS_TEXT,
  describeAccountPublishSummary,
  emptyDraft,
  getAccountDraftIssues,
  optionalOverrideCount,
  type OverrideDraft,
} from './helpers';

/** 分发账号紧凑行：主从列表左侧条目共用 */
export function DistributionAccountRow({
  account,
  draft,
  focused,
  disabled,
  onFocus,
  onRemove,
  className,
  plain = false,
  /** 覆盖项数量；不传则用视频默认 optionalOverrideCount */
  overrideCount,
  /** 角标文案前缀，默认「覆盖」；图文用「改过」 */
  overrideLabel = '覆盖',
  /** 行级问题文案；不传则用 getAccountDraftIssues */
  issues: issuesProp,
}: {
  account: PlatformAccountItem;
  draft: OverrideDraft;
  focused: boolean;
  disabled?: boolean;
  onFocus: () => void;
  onRemove: () => void;
  className?: string;
  plain?: boolean;
  overrideCount?: number;
  overrideLabel?: string;
  issues?: string[];
}) {
  const usable = account.status === 'active';
  const summary = describeAccountPublishSummary(draft);
  const issues = issuesProp ?? getAccountDraftIssues(draft);
  const ovCount = overrideCount ?? optionalOverrideCount(draft);

  return (
    <div
      className={cn(
        'group flex items-center gap-2 rounded-lg px-2 py-2 transition-colors',
        plain
          ? focused
            ? 'bg-primary/10'
            : 'hover:bg-muted/50'
          : focused
            ? 'border border-primary/40 bg-primary/5'
            : 'border hover:bg-muted/50',
        !usable && 'opacity-60',
        className,
      )}
    >
      <button
        type="button"
        disabled={!usable || disabled}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left disabled:cursor-not-allowed"
        onClick={onFocus}
      >
        <Avatar size="sm">
          {account.avatarUrl ? (
            <AvatarImage
              src={account.avatarUrl}
              alt={account.displayName}
              referrerPolicy="no-referrer"
            />
          ) : null}
          <AvatarFallback>{account.displayName.slice(0, 1)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-sm font-medium">{account.displayName}</p>
            {!usable ? (
              <Badge variant="outline" className="shrink-0 font-normal">
                {ACCOUNT_STATUS_TEXT[account.status]}
              </Badge>
            ) : null}
            {issues.length > 0 ? (
              <Badge variant="destructive" className="shrink-0 font-normal">
                {issues[0]}
              </Badge>
            ) : null}
            {usable && ovCount > 0 ? (
              <Badge variant="secondary" className="shrink-0 font-normal">
                {overrideLabel} {ovCount}
              </Badge>
            ) : null}
          </div>
          <p className="truncate text-xs text-muted-foreground">{summary}</p>
        </div>
      </button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className="shrink-0 opacity-60 hover:opacity-100"
        aria-label={`移除 ${account.displayName}`}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        <X />
      </Button>
    </div>
  );
}

export function distributionAccountDraftOrEmpty(
  drafts: Record<string, OverrideDraft>,
  accountId: string,
): OverrideDraft {
  return drafts[accountId] ?? emptyDraft();
}
