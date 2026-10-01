import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CircleCheck,
  Plus,
  SearchIcon,
  Send,
  SlidersHorizontal,
  Trash2,
  Users,
  X,
  XIcon,
} from 'lucide-react';
import { PlatformIcon } from '@/components/PlatformIcon';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { CoverKind, PlatformAccountItem, PlatformId } from '@/lib/api';
import { cn } from '@/lib/utils';
import { GraphicAccountEditor } from './GraphicAccountEditor';
import {
  ACCOUNT_STATUS_TEXT,
  type ArticleOverrideDraft,
  type CoverPair,
} from '../publish-article/helpers';
import { missingRequiredGraphicCovers } from './helpers';
import type { GraphicRosterEntry } from './use-graphic-composer';

type PlatformFilter = PlatformId | 'all';

/**
 * 分发区：左侧紧凑名单 + 右侧同屏编辑（窄屏则名单下展开）。
 * 不再用抽屉遮罩，点账号即切换右侧表单。
 */
export function GraphicDistributionPanel({
  entries,
  accountsEmpty,
  disabled,
  focusedAccountId,
  onFocusAccount,
  getDraft,
  setDraft,
  commonTitle,
  commonCovers,
  accountIssues,
  onAdd,
  onRemove,
  onBulkEdit,
  onEditCover,
}: {
  entries: GraphicRosterEntry[];
  accountsEmpty: boolean;
  disabled?: boolean;
  focusedAccountId: string | null;
  onFocusAccount: (accountId: string) => void;
  getDraft: (accountId: string) => ArticleOverrideDraft;
  setDraft: (accountId: string, draft: ArticleOverrideDraft) => void;
  commonTitle: string;
  commonCovers: CoverPair;
  accountIssues: Map<string, string[]>;
  onAdd: () => void;
  onRemove: (accountIds: string[]) => void;
  onBulkEdit: (accountIds: string[]) => void;
  onEditCover: (accountId: string, aspect: CoverKind) => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('all');
  const [checked, setChecked] = useState<Set<string>>(() => new Set());

  const platformOptions = useMemo(() => {
    const counts = new Map<PlatformId, { label: string; count: number }>();
    for (const { account, platformLabel } of entries) {
      const hit = counts.get(account.platform);
      counts.set(account.platform, { label: platformLabel, count: (hit?.count ?? 0) + 1 });
    }
    return [
      { value: 'all' as PlatformFilter, label: `全部平台 (${entries.length})` },
      ...[...counts.entries()].map(([value, { label, count }]) => ({
        value: value as PlatformFilter,
        label: `${label} (${count})`,
      })),
    ];
  }, [entries]);

  const activeFilter = platformOptions.some((o) => o.value === platformFilter)
    ? platformFilter
    : 'all';

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter(({ account }) => {
      if (activeFilter !== 'all' && account.platform !== activeFilter) {
        return false;
      }
      if (!q) {
        return true;
      }
      return (
        account.displayName.toLowerCase().includes(q) ||
        Boolean(account.platformUserId?.toLowerCase().includes(q))
      );
    });
  }, [entries, query, activeFilter]);

  // 有名单时保证始终聚焦一项（添加/移除后自动修正）
  useEffect(() => {
    if (entries.length === 0) {
      return;
    }
    const stillThere = focusedAccountId && entries.some((e) => e.account.id === focusedAccountId);
    if (!stillThere) {
      const next =
        entries.find((e) => e.account.status === 'active') ?? entries[0];
      onFocusAccount(next.account.id);
    }
  }, [entries, focusedAccountId, onFocusAccount]);

  const checkedIds = entries.filter((e) => checked.has(e.account.id)).map((e) => e.account.id);
  const visibleCheckedCount = visible.filter((e) => checked.has(e.account.id)).length;
  const allVisibleChecked = visible.length > 0 && visibleCheckedCount === visible.length;

  const toggleOne = (id: string, value: boolean) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (value) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const toggleVisible = (value: boolean) => {
    setChecked((prev) => {
      const next = new Set(prev);
      for (const { account } of visible) {
        if (value) {
          next.add(account.id);
        } else {
          next.delete(account.id);
        }
      }
      return next;
    });
  };

  if (accountsEmpty) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Users />
          </EmptyMedia>
          <EmptyTitle>还没有媒体账号</EmptyTitle>
          <EmptyDescription>先绑定平台账号，再回来选择分发</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            type="button"
            onClick={() => {
              void navigate('/platform-accounts');
            }}
          >
            去绑定账号
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  if (entries.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Send />
          </EmptyMedia>
          <EmptyTitle>选择要分发的账号</EmptyTitle>
          <EmptyDescription>同一平台可选多个账号，每个账号都能单独调整</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button type="button" disabled={disabled} onClick={onAdd}>
            <Plus data-icon="inline-start" />
            添加账号
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <InputGroup className="max-w-xs min-w-0 flex-1">
            <InputGroupInput
              value={query}
              placeholder="搜索账号"
              aria-label="搜索账号"
              onChange={(e) => {
                setQuery(e.target.value);
              }}
            />
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            {query ? (
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  size="icon-xs"
                  variant="ghost"
                  aria-label="清除搜索"
                  onClick={() => {
                    setQuery('');
                  }}
                >
                  <XIcon />
                </InputGroupButton>
              </InputGroupAddon>
            ) : null}
          </InputGroup>
          {platformOptions.length > 2 ? (
            <Select
              value={activeFilter}
              items={platformOptions}
              onValueChange={(value) => {
                setPlatformFilter((value as PlatformFilter | null) ?? 'all');
              }}
            >
              <SelectTrigger className="w-40 shrink-0" aria-label="平台">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {platformOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {checkedIds.length > 0 ? (
            <>
              <span className="text-muted-foreground">已选 {checkedIds.length} 个</span>
              <Button
                type="button"
                variant="outline"
                disabled={disabled}
                onClick={() => {
                  onBulkEdit(checkedIds);
                }}
              >
                <SlidersHorizontal data-icon="inline-start" />
                批量设置
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={disabled}
                onClick={() => {
                  onRemove(checkedIds);
                  setChecked(new Set());
                }}
              >
                <Trash2 data-icon="inline-start" />
                移除
              </Button>
            </>
          ) : null}
          <Button type="button" disabled={disabled} onClick={onAdd}>
            <Plus data-icon="inline-start" />
            添加账号
          </Button>
        </div>
      </div>

      {/* 左名单右表单；窄屏改为上下叠放 */}
      <div className="grid gap-4 lg:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)] xl:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Checkbox
              checked={allVisibleChecked}
              indeterminate={visibleCheckedCount > 0 && !allVisibleChecked}
              disabled={visible.length === 0}
              aria-label="全选"
              onCheckedChange={(value) => {
                toggleVisible(value);
              }}
            />
            <span className="text-xs text-muted-foreground">
              {visible.length === entries.length
                ? `${entries.length} 个账号`
                : `${visible.length} / ${entries.length}`}
            </span>
          </div>
          <div className="max-h-[min(28rem,50dvh)] min-h-0 flex-1 overflow-y-auto lg:max-h-[min(36rem,60dvh)]">
            {visible.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">没有匹配的账号</p>
            ) : (
              <ul className="flex flex-col p-1">
                {visible.map((entry) => (
                  <AccountListItem
                    key={entry.account.id}
                    entry={entry}
                    draft={getDraft(entry.account.id)}
                    commonCovers={commonCovers}
                    issues={accountIssues.get(entry.account.id) ?? []}
                    checked={checked.has(entry.account.id)}
                    focused={focusedAccountId === entry.account.id}
                    disabled={disabled}
                    onCheckedChange={(value) => {
                      toggleOne(entry.account.id, value);
                    }}
                    onFocus={() => {
                      onFocusAccount(entry.account.id);
                    }}
                    onRemove={() => {
                      onRemove([entry.account.id]);
                    }}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>

        <GraphicAccountEditor
          entries={entries}
          accountId={focusedAccountId}
          onNavigate={onFocusAccount}
          getDraft={getDraft}
          setDraft={setDraft}
          commonTitle={commonTitle}
          commonCovers={commonCovers}
          disabled={disabled}
          onEditCover={onEditCover}
          className="min-h-[28rem] lg:min-h-[32rem]"
        />
      </div>
    </div>
  );
}

function AccountListItem({
  entry,
  draft,
  commonCovers,
  issues,
  checked,
  focused,
  disabled,
  onCheckedChange,
  onFocus,
  onRemove,
}: {
  entry: GraphicRosterEntry;
  draft: ArticleOverrideDraft;
  commonCovers: CoverPair;
  issues: string[];
  checked: boolean;
  focused: boolean;
  disabled?: boolean;
  onCheckedChange: (value: boolean) => void;
  onFocus: () => void;
  onRemove: () => void;
}) {
  const { account, platformLabel } = entry;

  return (
    <li>
      <div
        className={cn(
          'flex items-center gap-2 rounded-md px-2 py-2 transition-colors',
          focused ? 'bg-muted' : 'hover:bg-muted/60',
        )}
      >
        <Checkbox
          checked={checked}
          aria-label={`选择 ${account.displayName}`}
          onCheckedChange={onCheckedChange}
        />
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
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
            <p className="truncate text-sm font-medium" title={account.displayName}>
              {account.displayName}
            </p>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <PlatformIcon platform={account.platform} className="size-3 rounded-[3px]" />
              <span className="truncate">{platformLabel}</span>
            </p>
          </div>
          <RowStatus
            account={account}
            draft={draft}
            commonCovers={commonCovers}
            issues={issues}
          />
        </button>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={disabled}
                aria-label={`移除 ${account.displayName}`}
                onClick={onRemove}
              />
            }
          >
            <X />
          </TooltipTrigger>
          <TooltipContent>移除</TooltipContent>
        </Tooltip>
      </div>
    </li>
  );
}

function RowStatus({
  account,
  draft,
  commonCovers,
  issues,
}: {
  account: PlatformAccountItem;
  draft: ArticleOverrideDraft;
  commonCovers: CoverPair;
  issues: string[];
}) {
  if (account.status !== 'active') {
    return (
      <Badge variant="outline" className="shrink-0">
        {ACCOUNT_STATUS_TEXT[account.status]}
      </Badge>
    );
  }
  if (issues.length > 0) {
    return (
      <Badge variant="destructive" className="shrink-0">
        {issues[0]}
      </Badge>
    );
  }
  if (missingRequiredGraphicCovers(draft, commonCovers, account.platform).length > 0) {
    return (
      <Badge variant="outline" className="shrink-0">
        缺封面
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="shrink-0">
      <CircleCheck data-icon="inline-start" />
      就绪
    </Badge>
  );
}
