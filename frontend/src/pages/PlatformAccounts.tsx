import { useEffect, useRef, useState } from 'react';
import { AppWindow, Link2, MoreHorizontal, Pencil, Plus, RefreshCw, SearchIcon, Trash2 } from 'lucide-react';
import { PlatformIcon } from '@/components/PlatformIcon';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Skeleton } from '@/components/ui/skeleton';
import { useAgent } from '@/hooks/use-agent';
import { PLATFORM_ACCOUNT_SYNCED_EVENT } from '@/hooks/use-creator-window-sync';
import { agentClient, type AgentCookie } from '@/lib/agent-client';
import {
  bindPlatformAccount,
  deletePlatformAccount,
  fetchPlatformAccountCredentials,
  fetchPlatformAccounts,
  fetchPlatformCatalog,
  reauthPlatformAccount,
  renamePlatformAccount,
  type PlatformAccountItem,
  type PlatformCatalogItem,
} from '@/lib/api';
import { matchPlatformQuery } from '@/lib/platforms';
import { cn } from '@/lib/utils';

const OPEN_ERROR_TEXT: Record<string, string> = {
  invalid_payload: '请求参数不完整',
  missing_cookies: '账号缺少登录凭证，请先重新授权',
};

function openErrorText(code: string | undefined): string {
  if (!code) {
    return '打开创作者中心失败';
  }
  if (code.startsWith('unsupported_platform')) {
    return '当前 Agent 版本不支持该平台，请升级 Agent';
  }
  return OPEN_ERROR_TEXT[code] ?? `打开创作者中心失败（${code}）`;
}

const STATUS_META: Record<
  PlatformAccountItem['status'],
  {
    label: string;
    variant: 'default' | 'secondary' | 'destructive' | 'outline';
  }
> = {
  active: { label: '已授权', variant: 'default' },
  expired: { label: '登录过期', variant: 'outline' },
  revoked: { label: '已失效', variant: 'destructive' },
};

function formatTime(value: string | null): string {
  if (!value) {
    return '—';
  }
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function PlatformAccounts() {
  const { connected } = useAgent();
  const [catalog, setCatalog] = useState<PlatformCatalogItem[]>([]);
  const [accounts, setAccounts] = useState<PlatformAccountItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<string>('');
  const [platformQuery, setPlatformQuery] = useState('');
  const [renameTarget, setRenameTarget] = useState<PlatformAccountItem | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const platformLabel = (id: string) => catalog.find((item) => item.id === id)?.displayName ?? id;

  const filteredCatalog = catalog.filter((item) => matchPlatformQuery(item, platformQuery));

  const reload = async () => {
    setLoading(true);
    setError('');
    try {
      const [platforms, list] = await Promise.all([fetchPlatformCatalog(), fetchPlatformAccounts()]);
      setCatalog(platforms);
      setAccounts(list);
      if (!selectedPlatform && platforms[0]) {
        setSelectedPlatform(platforms[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  // Latest reload in a ref so the one-shot effect below never goes stale.
  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
  });

  useEffect(() => {
    // Initial load, deferred to a task so no setState runs synchronously in
    // the effect body (react-hooks/set-state-in-effect).
    const initial = setTimeout(() => {
      void reloadRef.current();
    }, 0);
    // Refresh the list after a creator-center window's cookies are written
    // back (the write-back itself runs app-wide in AppLayout).
    const onSynced = () => {
      void reloadRef.current();
    };
    window.addEventListener(PLATFORM_ACCOUNT_SYNCED_EVENT, onSynced);
    return () => {
      clearTimeout(initial);
      window.removeEventListener(PLATFORM_ACCOUNT_SYNCED_EVENT, onSynced);
    };
  }, []);

  const handleOpenCreator = async (account: PlatformAccountItem) => {
    if (!connected) {
      setError('请先启动桌面 Agent（cd agent && npm run dev）');
      return;
    }
    setOpeningId(account.id);
    setError('');
    try {
      const credentials = await fetchPlatformAccountCredentials(account.id);
      const result = await agentClient.openCreatorCenter({
        accountId: account.id,
        platform: credentials.platform,
        displayName: account.displayName,
        url: credentials.openUrl,
        cookies: credentials.cookies as AgentCookie[],
      });
      if (!result.ok) {
        throw new Error(openErrorText(result.error));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '打开创作者中心失败');
    } finally {
      setOpeningId(null);
    }
  };

  const runAuthAndBind = async (mode: 'create' | 'reauth', accountId?: string) => {
    if (!connected) {
      setError('请先启动桌面 Agent（cd agent && npm run dev）');
      return;
    }
    const platform = mode === 'create' ? selectedPlatform : accounts.find((a) => a.id === accountId)?.platform;
    if (!platform) {
      setError('请选择平台');
      return;
    }

    const meta = catalog.find((item) => item.id === platform);
    setBusy(true);
    setError('');
    setDialogOpen(false);
    try {
      const result = await agentClient.startPlatformAuth({
        platform,
        loginUrl: meta?.loginUrl,
      });
      if (!result.ok || !result.cookies?.length) {
        if (result.error === 'cancelled' || result.error === 'window_closed') {
          return;
        }
        throw new Error(result.error ?? '授权失败');
      }

      if (mode === 'reauth' && accountId) {
        await reauthPlatformAccount(accountId, {
          cookies: result.cookies,
          finalUrl: result.finalUrl,
          profile: result.profile,
        });
      } else {
        // No displayName here on purpose: the backend prefers the Agent's
        // scraped nickname and only falls back to a placeholder.
        await bindPlatformAccount({
          platform,
          cookies: result.cookies,
          finalUrl: result.finalUrl,
          profile: result.profile,
        });
      }
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : '授权失败');
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async () => {
    const target = renameTarget;
    const next = renameValue.trim();
    if (!target || !next) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await renamePlatformAccount(target.id, next);
      setRenameTarget(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : '编辑失败');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('确定删除该媒体账号？')) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await deletePlatformAccount(id);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">媒体账号</h1>
          <p className="text-sm text-muted-foreground">通过桌面 Agent 打开类 Chrome 授权窗，完成抖音 / 头条 / 视频号 / B 站绑定</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={loading || busy}
            onClick={() => {
              void reload();
            }}
          >
            <RefreshCw data-icon="inline-start" />
            刷新
          </Button>
          <Button
            size="sm"
            disabled={!connected || busy}
            onClick={() => {
              setPlatformQuery('');
              setDialogOpen(true);
            }}
          >
            <Plus data-icon="inline-start" />
            添加账号
          </Button>
        </div>
      </div>

      {!connected ? (
        <Alert>
          <AlertDescription>
            Agent 未连接。请运行 <code className="rounded bg-muted px-1">cd agent && npm run dev</code> 后再添加账号。
          </AlertDescription>
        </Alert>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="h-full gap-3">
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="size-10 rounded-full" />
                  <div className="flex flex-1 flex-col gap-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
                <Skeleton className="h-3 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Link2 />
            </EmptyMedia>
            <EmptyTitle>暂无媒体账号</EmptyTitle>
            <EmptyDescription>点击右上角「添加账号」，通过桌面 Agent 完成授权绑定。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {accounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              platformName={platformLabel(account.platform)}
              connected={connected}
              busy={busy}
              opening={openingId === account.id}
              onOpenCreator={() => {
                void handleOpenCreator(account);
              }}
              onReauth={() => {
                void runAuthAndBind('reauth', account.id);
              }}
              onRename={() => {
                setRenameTarget(account);
                setRenameValue(account.displayName);
              }}
              onDelete={() => {
                void handleDelete(account.id);
              }}
            />
          ))}
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setPlatformQuery('');
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>添加媒体账号</DialogTitle>
            <DialogDescription>选择平台后，Agent 将打开隔离的类 Chrome 授权窗口。登录完成后可自动检测，或点击窗口内「完成授权」。</DialogDescription>
          </DialogHeader>
          <FieldGroup className="gap-4 py-2">
            <Field>
              <FieldLabel htmlFor="platform-search">搜索平台</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="platform-search"
                  value={platformQuery}
                  placeholder="按名称搜索，如 抖音、B站、小红书"
                  autoFocus
                  onChange={(e) => {
                    setPlatformQuery(e.target.value);
                  }}
                />
                <InputGroupAddon>
                  <SearchIcon />
                </InputGroupAddon>
              </InputGroup>
            </Field>
            <Field>
              <FieldLabel id="platform-grid-label">选择平台</FieldLabel>
              {filteredCatalog.length === 0 ? (
                <Empty className="border border-dashed py-8">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <SearchIcon />
                    </EmptyMedia>
                    <EmptyTitle>未找到平台</EmptyTitle>
                    <EmptyDescription>换个关键词试试，例如「头条」「视频号」「B站」。</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div
                  role="radiogroup"
                  aria-labelledby="platform-grid-label"
                  className="grid grid-cols-2 gap-3 sm:grid-cols-3"
                >
                  {filteredCatalog.map((item) => {
                    const selected = selectedPlatform === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => {
                          setSelectedPlatform(item.id);
                        }}
                        className={cn(
                          'flex flex-col items-center gap-2 rounded-xl bg-card p-4 text-sm shadow-xs ring-1 ring-foreground/10 transition-[color,box-shadow] outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50',
                          selected && 'bg-muted ring-2 ring-ring',
                        )}
                      >
                        <PlatformIcon platform={item.id} className="size-10" />
                        <span className="truncate font-medium">{item.displayName}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDialogOpen(false);
              }}
            >
              取消
            </Button>
            <Button
              disabled={!selectedPlatform || !connected || busy}
              onClick={() => {
                void runAuthAndBind('create');
              }}
            >
              开始授权
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRenameTarget(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑账号</DialogTitle>
            <DialogDescription>授权时会自动读取平台昵称；读取失败或想用自定义名称时，可在此手动修改。</DialogDescription>
          </DialogHeader>
          <FieldGroup className="gap-4 py-2">
            <Field>
              <FieldLabel htmlFor="rename-account">账号名称</FieldLabel>
              <Input
                id="rename-account"
                value={renameValue}
                autoFocus
                placeholder="账号名称"
                onChange={(e) => {
                  setRenameValue(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    void handleRename();
                  }
                }}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRenameTarget(null);
              }}
            >
              取消
            </Button>
            <Button
              disabled={!renameValue.trim() || busy}
              onClick={() => {
                void handleRename();
              }}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AccountCard({
  account,
  platformName,
  connected,
  busy,
  opening,
  onOpenCreator,
  onReauth,
  onRename,
  onDelete,
}: {
  account: PlatformAccountItem;
  platformName: string;
  connected: boolean;
  busy: boolean;
  opening: boolean;
  onOpenCreator: () => void;
  onReauth: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const status = STATUS_META[account.status];
  const needsReauth = account.status !== 'active';

  return (
    // h-full + 底栏 mt-auto：同排卡片等高，底栏始终贴底，
    // 不受名称/平台文本行数影响（内容管理页曾踩过的坑）。
    <Card className="h-full gap-3">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar size="lg">
              {account.avatarUrl ? <AvatarImage src={account.avatarUrl} alt={account.displayName} referrerPolicy="no-referrer" /> : null}
              <AvatarFallback>{account.displayName.slice(0, 1)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-medium" title={account.displayName}>
                {account.displayName}
              </p>
              <p className="text-xs text-muted-foreground">{platformName}</p>
            </div>
          </div>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">最近授权 {formatTime(account.lastAuthedAt)}</p>
      </CardContent>
      <CardFooter className="mt-auto justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {needsReauth ? (
            <Button
              variant="destructive"
              size="sm"
              disabled={!connected || busy}
              onClick={onReauth}
            >
              <Link2 data-icon="inline-start" />
              重新授权
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={!connected || busy || opening}
              title="用该账号的登录态打开创作者后台"
              onClick={onOpenCreator}
            >
              <AppWindow data-icon="inline-start" />
              {opening ? '打开中…' : '查看'}
            </Button>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="sm" disabled={busy} />}>
            <MoreHorizontal data-icon="inline-start" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem disabled={busy} onClick={onRename}>
                <Pencil />
                编辑
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" disabled={busy} onClick={onDelete}>
                <Trash2 />
                删除
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardFooter>
    </Card>
  );
}
