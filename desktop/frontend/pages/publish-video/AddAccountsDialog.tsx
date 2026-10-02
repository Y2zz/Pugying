import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layers, SearchIcon, XIcon } from 'lucide-react';
import { PlatformIcon } from '@/components/PlatformIcon';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
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
 * 选择分发账号：左栏平台、右栏账号列表（头像 + 昵称 + 勾选）。
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
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: PlatformCatalogItem[];
  accounts: PlatformAccountItem[];
  selected: Record<string, boolean>;
  onConfirm: (nextSelected: Record<string, boolean>) => void;
  className?: string;
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
    setPlatformFocus('all');
    setQuery('');
  }, [open, selected, catalog, accounts]);

  const platformAccounts = useMemo(() => {
    const byPlatform =
      platformFocus === 'all' ? accounts : accounts.filter((account) => account.platform === platformFocus);
    return byPlatform.filter((account) => matchAccountQuery(account, query));
  }, [accounts, platformFocus, query]);

  const draftCount = Object.values(draft).filter(Boolean).length;
  const hasQuery = query.trim().length > 0;

  const toggleAccount = (account: PlatformAccountItem, checked: boolean) => {
    if (!isAccountSelectable(account)) {
      return;
    }
    setDraft((prev) => ({
      ...prev,
      [account.id]: checked,
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
      <DialogContent
        className={cn(
          'flex h-[min(36rem,85dvh)] flex-col gap-4 overflow-hidden sm:max-w-2xl',
          className,
        )}
      >
        <DialogHeader>
          <DialogTitle>添加分发账号</DialogTitle>
          <DialogDescription>选择要分发的账号</DialogDescription>
        </DialogHeader>

        {/* 分区用一块浅底（左栏）代替多条描边，避免 Dialog 内「满屏线」 */}
        <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden sm:grid-cols-[10rem_minmax(0,1fr)] sm:grid-rows-1">
          <nav className="flex gap-1 overflow-x-auto rounded-lg bg-muted/40 p-2 sm:flex-col" aria-label="支持的平台">
            {[{ id: 'all' as const, displayName: '全部平台' }, ...catalog].map((item) => {
              const available = accounts.filter((a) =>
                (item.id === 'all' || a.platform === item.id) && isAccountSelectable(a),
              );
              const selectedCount = available.filter((a) => draft[a.id]).length;
              const active = platformFocus === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    'flex shrink-0 items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-full',
                    active ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:bg-background/70',
                  )}
                  aria-pressed={active}
                  aria-label={`${item.displayName}，已选 ${selectedCount} 个，可选 ${available.length} 个`}
                  onClick={() => {
                    setPlatformFocus(item.id);
                  }}
                >
                  {item.id === 'all' ? <Layers className="size-5 shrink-0" aria-hidden /> : <PlatformIcon platform={item.id} className="size-5 shrink-0" />}
                  <span className="min-w-0 flex-1 truncate font-medium">{item.displayName}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{selectedCount}/{available.length}</span>
                </button>
              );
            })}
          </nav>

          <div className="flex min-h-0 flex-col overflow-hidden">
            <div className="shrink-0 p-1">
              <InputGroup>
                <InputGroupInput
                  id="add-account-search"
                  value={query}
                  placeholder="搜索昵称或平台用户 ID"
                  aria-label="搜索账号"
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
              <div className="flex min-h-full flex-col gap-3 px-1 pt-3 pb-1">
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
                          ? '换个关键词试试'
                          : '可切换平台或先绑定账号'}
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <FieldGroup className="gap-1.5" role="group" aria-label="分发账号">
                    {platformAccounts.map((account) => {
                      const selectable = isAccountSelectable(account);
                      const isSelected = selectable && Boolean(draft[account.id]);
                      const checkboxId = `distribution-account-${account.id}`;
                      const platformLabel = catalog.find((item) => item.id === account.platform)?.displayName;

                      return (
                        <Field
                          key={account.id}
                          orientation="horizontal"
                          data-disabled={!selectable || undefined}
                          className={cn(
                            'items-center gap-3 rounded-lg px-3 py-2.5 transition-colors',
                            selectable && (isSelected ? 'bg-primary/10' : 'hover:bg-muted/50'),
                          )}
                        >
                          <FieldLabel htmlFor={checkboxId} className="min-w-0 flex-1 items-center gap-3">
                            <Avatar aria-hidden>
                              {account.avatarUrl ? (
                                <AvatarImage
                                  src={account.avatarUrl}
                                  alt={account.displayName}
                                  referrerPolicy="no-referrer"
                                />
                              ) : null}
                              <AvatarFallback>{account.displayName.slice(0, 1)}</AvatarFallback>
                            </Avatar>
                            <div className="flex min-w-0 flex-1 flex-col gap-1">
                              <span className="truncate" title={account.displayName}>
                                {account.displayName}
                              </span>
                              <span className="truncate text-xs font-normal text-muted-foreground">
                                {platformLabel}
                                {account.platformUserId ? ` · ${account.platformUserId}` : ''}
                              </span>
                            </div>
                          </FieldLabel>
                          {!selectable ? <Badge variant="secondary">需重新授权</Badge> : null}
                          <Checkbox
                            id={checkboxId}
                            checked={isSelected}
                            disabled={!selectable}
                            aria-label={`选择 ${account.displayName}`}
                            onCheckedChange={(checked) => {
                              toggleAccount(account, checked);
                            }}
                          />
                        </Field>
                      );
                    })}
                  </FieldGroup>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground" aria-live="polite">已选 {draftCount} 个账号</p>
            {platformAccounts.some((account) => !isAccountSelectable(account)) ? (
              <Link to="/platform-accounts" className="text-xs text-muted-foreground underline underline-offset-4">
                去媒体账号重新授权
              </Link>
            ) : null}
          </div>
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
              确认选择
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
