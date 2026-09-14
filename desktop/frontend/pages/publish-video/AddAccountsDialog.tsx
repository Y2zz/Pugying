import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, SearchIcon, XIcon } from 'lucide-react';
import { PlatformIcon } from '@/components/PlatformIcon';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { type PlatformAccountItem, type PlatformCatalogItem, type PlatformId } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ACCOUNT_STATUS_TEXT } from './helpers';

/** 按昵称 / 平台用户 ID 模糊匹配（不区分大小写） */
function matchAccountQuery(account: PlatformAccountItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  if (account.displayName.toLowerCase().includes(q)) {
    return true;
  }
  return Boolean(account.platformUserId?.toLowerCase().includes(q));
}

function isAccountSelectable(account: PlatformAccountItem): boolean {
  return account.status === 'active';
}

/**
 * 选择分发账号：左栏平台、右栏账号卡片（头像 + 昵称）。
 * 打开时同步当前已选；确认后一次性写回，避免边选边改左侧列表。
 * 失效账号仅展示不可勾选，须前往「媒体账号」重新授权。
 */
export function AddAccountsDialog({
  open,
  onOpenChange,
  catalog,
  accounts,
  selected,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: PlatformCatalogItem[];
  accounts: PlatformAccountItem[];
  selected: Record<string, boolean>;
  onConfirm: (nextSelected: Record<string, boolean>) => void;
}) {
  const [platformFocus, setPlatformFocus] = useState<PlatformId | 'all'>('all');
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) {
      return;
    }
    // 打开时剔除不可选账号，避免历史勾选残留
    const nextDraft: Record<string, boolean> = {};
    for (const [id, checked] of Object.entries(selected)) {
      if (!checked) {
        continue;
      }
      const account = accounts.find((item) => item.id === id);
      if (account && isAccountSelectable(account)) {
        nextDraft[id] = true;
      }
    }
    setDraft(nextDraft);
    setPlatformFocus(catalog[0]?.id ?? 'all');
    setQuery('');
  }, [open, selected, catalog, accounts]);

  const platformAccounts = useMemo(() => {
    const byPlatform =
      platformFocus === 'all' ? accounts : accounts.filter((account) => account.platform === platformFocus);
    return byPlatform.filter((account) => matchAccountQuery(account, query));
  }, [accounts, platformFocus, query]);

  const draftCount = Object.values(draft).filter(Boolean).length;
  const hasQuery = query.trim().length > 0;

  const toggleAccount = (account: PlatformAccountItem) => {
    if (!isAccountSelectable(account)) {
      return;
    }
    setDraft((prev) => ({
      ...prev,
      [account.id]: !prev[account.id],
    }));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setQuery('');
        }
      }}
    >
      <DialogContent className="flex h-[min(640px,80vh)] flex-col gap-4 overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>添加分发账号</DialogTitle>
          <DialogDescription>
            选择要推送的媒体账号；登录失效的账号须前往
            <Link to="/platform-accounts" className="mx-1 underline">
              媒体账号
            </Link>
            重新授权。
          </DialogDescription>
        </DialogHeader>

        {/* 分区用一块浅底（左栏）代替多条描边，避免 Dialog 内「满屏线」 */}
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden rounded-xl sm:grid-cols-[200px_minmax(0,1fr)]">
          <nav className="flex flex-col gap-1 bg-muted/50 p-2 sm:rounded-l-xl" aria-label="支持的平台">
            {catalog.map((item) => {
              const count = accounts.filter((a) => a.platform === item.id && matchAccountQuery(a, query)).length;
              const active = platformFocus === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                    active ? 'bg-background text-foreground shadow-xs' : 'hover:bg-background/70'
                  )}
                  onClick={() => {
                    setPlatformFocus(item.id);
                  }}
                >
                  <PlatformIcon platform={item.id} className="size-6" />
                  <span className="min-w-0 flex-1 truncate font-medium">{item.displayName}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{count}</span>
                </button>
              );
            })}
          </nav>

          <div className="flex min-h-0 flex-col overflow-hidden">
            <div className="shrink-0 p-3 pb-0">
              <InputGroup>
                <InputGroupInput
                  id="add-account-search"
                  value={query}
                  placeholder="搜索昵称或平台用户 ID"
                  autoFocus
                  onChange={(e) => {
                    setQuery(e.target.value);
                  }}
                />
                <InputGroupAddon>
                  <SearchIcon />
                </InputGroupAddon>
                {/* 始终占位，避免有无清除按钮时 InputGroup 高度跳动 */}
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    size="icon-xs"
                    variant="ghost"
                    aria-label="清除搜索"
                    className={cn(!hasQuery && 'invisible')}
                    disabled={!hasQuery}
                    tabIndex={hasQuery ? 0 : -1}
                    onClick={() => {
                      setQuery('');
                    }}
                  >
                    <XIcon />
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              <div className="flex min-h-full flex-col gap-3 p-3">
                {accounts.length === 0 ? (
                  <Empty className="min-h-full flex-1 bg-muted/40 py-10">
                    <EmptyHeader>
                      <EmptyTitle>还没有媒体账号</EmptyTitle>
                      <EmptyDescription>
                        请先前往
                        <Link to="/platform-accounts" className="mx-1 underline">
                          媒体账号
                        </Link>
                        完成绑定。
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : platformAccounts.length === 0 ? (
                  <Empty className="min-h-full flex-1 bg-muted/40 py-10">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <SearchIcon />
                      </EmptyMedia>
                      <EmptyTitle>{hasQuery ? '未找到账号' : '该平台暂无账号'}</EmptyTitle>
                      <EmptyDescription>
                        {hasQuery
                          ? '换个关键词试试，或切换左侧平台。'
                          : '换一个平台，或去媒体账号页绑定后再回来选择。'}
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {platformAccounts.map((account) => {
                      const selectable = isAccountSelectable(account);
                      const isSelected = Boolean(draft[account.id]);
                      const cardClassName = cn(
                        'relative flex items-center gap-3 rounded-xl bg-muted/50 p-3 text-left transition-colors',
                        selectable ? 'hover:bg-muted' : 'cursor-not-allowed opacity-60',
                        selectable && isSelected ? 'bg-primary/10 hover:bg-primary/15' : null,
                      );

                      if (!selectable) {
                        return (
                          <div key={account.id} className={cardClassName} aria-disabled="true">
                            <Avatar size="lg">
                              {account.avatarUrl ? (
                                <AvatarImage
                                  src={account.avatarUrl}
                                  alt={account.displayName}
                                  referrerPolicy="no-referrer"
                                />
                              ) : null}
                              <AvatarFallback>{account.displayName.slice(0, 1)}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1 pr-1">
                              <p className="truncate font-medium" title={account.displayName}>
                                {account.displayName}
                              </p>
                              <div className="mt-1.5">
                                <Badge variant="outline" className="font-normal">
                                  {ACCOUNT_STATUS_TEXT[account.status]}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <button
                          key={account.id}
                          type="button"
                          aria-pressed={isSelected}
                          className={cn('w-full', cardClassName)}
                          onClick={() => {
                            toggleAccount(account);
                          }}
                        >
                          {isSelected ? (
                            <span
                              className="pointer-events-none absolute top-2 right-2 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground"
                            >
                              <Check className="size-3" aria-hidden />
                            </span>
                          ) : null}
                          <Avatar size="lg">
                            {account.avatarUrl ? (
                              <AvatarImage
                                src={account.avatarUrl}
                                alt={account.displayName}
                                referrerPolicy="no-referrer"
                              />
                            ) : null}
                            <AvatarFallback>{account.displayName.slice(0, 1)}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1 pr-1">
                            <p className="truncate font-medium" title={account.displayName}>
                              {account.displayName}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          <p className="text-muted-foreground">已选 {draftCount} 个账号</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              取消
            </Button>
            <Button
              onClick={() => {
                onConfirm(draft);
                onOpenChange(false);
              }}
            >
              确定
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
