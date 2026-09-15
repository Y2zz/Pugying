import { useEffect, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Check, ExternalLink, Link2, MoreHorizontal, Pencil, Plus, RefreshCw, RotateCcw, SearchIcon, Trash2, XIcon } from 'lucide-react';
import { PageHeader } from '@/components/layouts/PageHeader';
import { PlatformIcon } from '@/components/PlatformIcon';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AgentNeededDialog } from '@/components/AgentNeededDialog';
import { useAgent } from '@/hooks/use-agent';
import { PLATFORM_ACCOUNT_SYNCED_EVENT } from '@/hooks/use-creator-window-sync';
import { agentClient, type AgentCookie, type PlatformAuthProgressPhase } from '@/lib/agent-client';
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
  type PlatformId,
} from '@/lib/api';
import { matchPlatformQuery } from '@/lib/platforms';
import { cn } from '@/lib/utils';

/** 列表筛选：全部 + 平台目录中的各平台 */
type PlatformFilter = 'all' | PlatformId;

/** 账号卡片每页条数：对齐 xl 下 4 列 × 3 行 */
const ACCOUNT_PAGE_SIZE = 12;

type AuthPhase = 'opening' | PlatformAuthProgressPhase | 'binding';

type AuthLockState = {
  mode: 'create' | 'reauth';
  platformName: string;
  requestId: string;
  phase: AuthPhase;
};

type AuthSuccessState = {
  mode: 'create' | 'reauth';
  account: PlatformAccountItem;
  platformName: string;
  weakProfile: boolean;
};

function createAuthRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `auth-${crypto.randomUUID()}`;
  }
  return `auth-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const OPEN_ERROR_TEXT: Record<string, string> = {
  invalid_payload: '请求参数不完整',
  missing_cookies: '账号缺少登录凭证，请先重新授权',
};

const AUTH_ERROR_TEXT: Record<string, string> = {
  invalid_payload: '请求参数不完整',
  duplicate_request_id: '已有进行中的授权，请先完成或退出后再试',
  not_found: '授权会话已结束，请重新开始',
};

function openErrorText(code: string | undefined): string {
  if (!code) {
    return '打开创作者中心失败';
  }
  if (code.startsWith('unsupported_platform')) {
    return '当前桌面端版本不支持该平台，请升级应用';
  }
  return OPEN_ERROR_TEXT[code] ?? `打开创作者中心失败（${code}）`;
}

function authErrorText(code: string | undefined): string {
  if (!code) {
    return '授权失败';
  }
  if (code.startsWith('unsupported_platform')) {
    return '当前桌面端版本不支持该平台，请升级应用';
  }
  return AUTH_ERROR_TEXT[code] ?? `授权失败（${code}）`;
}

function isWeakProfileName(displayName: string, platformName: string, hasNickname: boolean): boolean {
  if (!hasNickname) {
    return true;
  }
  return displayName === `${platformName}账号`;
}

const STATUS_META: Record<
  PlatformAccountItem['status'],
  {
    label: string;
    variant: 'default' | 'secondary' | 'destructive' | 'outline';
    className?: string;
  }
> = {
  // 成功态用翠绿，与 primary（中性）区分开
  active: {
    label: '已授权',
    variant: 'default',
    className: 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400',
  },
  expired: { label: '未授权', variant: 'destructive' },
  revoked: { label: '未授权', variant: 'destructive' },
};

const AUTH_STEPS: Array<{ id: 'open' | 'login' | 'bind'; label: (platformName: string) => string }> = [
  { id: 'open', label: () => '打开授权窗口' },
  { id: 'login', label: (platformName) => `在 Agent 登录「${platformName}」` },
  { id: 'bind', label: () => '保存到蒲公英' },
];

function authStepStatus(stepId: 'open' | 'login' | 'bind', phase: AuthPhase): 'done' | 'current' | 'pending' {
  const currentStep = phase === 'opening' ? 0 : phase === 'window_opened' || phase === 'awaiting_login' || phase === 'finishing' ? 1 : 2;
  const stepIndex = stepId === 'open' ? 0 : stepId === 'login' ? 1 : 2;
  if (stepIndex < currentStep) {
    return 'done';
  }
  if (stepIndex === currentStep) {
    return 'current';
  }
  return 'pending';
}

/** 悬停 title 用完整时间，便于核对精确时刻 */
function formatAbsoluteTime(value: string | null): string {
  if (!value) {
    return '—';
  }
  try {
    return new Date(value).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return value;
  }
}

/** 卡片脚注用相对时间，如「5 分钟前」 */
function formatRelativeTime(value: string | null): string {
  if (!value) {
    return '—';
  }
  try {
    return formatDistanceToNow(new Date(value), { addSuffix: true, locale: zhCN });
  } catch {
    return value;
  }
}

/** 生成带省略号的页码序列，避免页数多时撑爆底栏 */
function buildPageList(current: number, total: number): Array<number | 'gap'> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages = new Set<number>([1, total]);
  for (let i = current - 1; i <= current + 1; i++) {
    if (i >= 1 && i <= total) {
      pages.add(i);
    }
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const result: Array<number | 'gap'> = [];
  for (let i = 0; i < sorted.length; i++) {
    const page = sorted[i]!;
    if (i > 0 && page - sorted[i - 1]! > 1) {
      result.push('gap');
    }
    result.push(page);
  }
  return result;
}

export default function PlatformAccounts() {
  const { connected } = useAgent();
  const [catalog, setCatalog] = useState<PlatformCatalogItem[]>([]);
  const [accounts, setAccounts] = useState<PlatformAccountItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [authLock, setAuthLock] = useState<AuthLockState | null>(null);
  const [authSuccess, setAuthSuccess] = useState<AuthSuccessState | null>(null);
  const authSessionRef = useRef(0);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<string>('');
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('all');
  const [accountQuery, setAccountQuery] = useState('');
  const [page, setPage] = useState(1);
  const [platformQuery, setPlatformQuery] = useState('');
  const [renameTarget, setRenameTarget] = useState<PlatformAccountItem | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<PlatformAccountItem | null>(null);
  const [agentNeededOpen, setAgentNeededOpen] = useState(false);

  const platformLabel = (id: string) => catalog.find((item) => item.id === id)?.displayName ?? id;

  const filteredCatalog = catalog.filter((item) => matchPlatformQuery(item, platformQuery));
  // 平台筛选已由服务端完成；此处仅做名称搜索与分页
  const filteredAccounts = accounts.filter((account) => {
    const q = accountQuery.trim().toLowerCase();
    if (!q) {
      return true;
    }
    if (account.displayName.toLowerCase().includes(q)) {
      return true;
    }
    if (account.platformUserId?.toLowerCase().includes(q)) {
      return true;
    }
    // 也匹配平台名，方便在「全部」下用「抖音」等关键词缩小范围
    return platformLabel(account.platform).toLowerCase().includes(q);
  });
  const totalPages = Math.max(1, Math.ceil(filteredAccounts.length / ACCOUNT_PAGE_SIZE));
  // 筛选/删除后结果变少时，钳制到合法页，避免空白页
  const currentPage = Math.min(page, totalPages);
  const pagedAccounts = filteredAccounts.slice(
    (currentPage - 1) * ACCOUNT_PAGE_SIZE,
    currentPage * ACCOUNT_PAGE_SIZE,
  );

  const requireAgent = (): boolean => {
    if (connected) {
      return true;
    }
    setAgentNeededOpen(true);
    return false;
  };

  // 平台下拉选项：默认「全部平台」，其余来自目录；切平台时仍走服务端筛选
  const platformFilterOptions: Array<{ value: PlatformFilter; label: string }> = [
    { value: 'all', label: '全部平台' },
    ...catalog.map((item) => ({ value: item.id as PlatformFilter, label: item.displayName })),
  ];

  // 关键词或平台任一偏离默认时，允许一键重置
  const hasSearchFilters = Boolean(accountQuery.trim()) || platformFilter !== 'all';

  const loadSeqRef = useRef(0);
  const reload = async (filter: PlatformFilter = platformFilter) => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    setError('');
    try {
      const [platforms, list] = await Promise.all([
        fetchPlatformCatalog(),
        fetchPlatformAccounts(filter === 'all' ? undefined : { platform: filter }),
      ]);
      if (seq !== loadSeqRef.current) {
        return;
      }
      setCatalog(platforms);
      setAccounts(list);
      if (!selectedPlatform && platforms[0]) {
        setSelectedPlatform(platforms[0].id);
      }
    } catch (err) {
      if (seq !== loadSeqRef.current) {
        return;
      }
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      if (seq === loadSeqRef.current) {
        setLoading(false);
      }
    }
  };

  const resetSearchFilters = () => {
    setAccountQuery('');
    setPlatformFilter('all');
    setPage(1);
    void reload('all');
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
    if (!requireAgent()) {
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
    if (!requireAgent()) {
      return;
    }
    const platform = mode === 'create' ? selectedPlatform : accounts.find((a) => a.id === accountId)?.platform;
    if (!platform) {
      setError('请选择平台');
      return;
    }

    const meta = catalog.find((item) => item.id === platform);
    const platformName = meta?.displayName ?? platformLabel(platform);
    const requestId = createAuthRequestId();
    const session = ++authSessionRef.current;
    setBusy(true);
    setError('');
    setAuthSuccess(null);
    setDialogOpen(false);
    setAuthLock({ mode, platformName, requestId, phase: 'opening' });
    try {
      const result = await agentClient.startPlatformAuth({
        platform,
        loginUrl: meta?.loginUrl,
        requestId,
        onProgress: (progress) => {
          if (session !== authSessionRef.current) {
            return;
          }
          setAuthLock((prev) => (prev && prev.requestId === requestId ? { ...prev, phase: progress.phase } : prev));
        },
      });
      if (session !== authSessionRef.current) {
        return;
      }
      if (!result.ok || !result.cookies?.length) {
        if (result.error === 'cancelled' || result.error === 'window_closed') {
          return;
        }
        throw new Error(authErrorText(result.error));
      }

      setAuthLock((prev) => (prev && prev.requestId === requestId ? { ...prev, phase: 'binding' } : prev));

      let bound: PlatformAccountItem;
      if (mode === 'reauth' && accountId) {
        bound = await reauthPlatformAccount(accountId, {
          cookies: result.cookies,
          finalUrl: result.finalUrl,
          profile: result.profile,
        });
      } else {
        // No displayName here on purpose: the backend prefers the Agent's
        // scraped nickname and only falls back to a placeholder.
        bound = await bindPlatformAccount({
          platform,
          cookies: result.cookies,
          finalUrl: result.finalUrl,
          profile: result.profile,
        });
      }
      if (session !== authSessionRef.current) {
        return;
      }
      await reload();
      setAuthSuccess({
        mode,
        account: bound,
        platformName,
        weakProfile: isWeakProfileName(bound.displayName, platformName, Boolean(result.profile?.nickname?.trim())),
      });
    } catch (err) {
      if (session !== authSessionRef.current) {
        return;
      }
      setError(err instanceof Error ? err.message : '授权失败');
    } finally {
      if (session === authSessionRef.current) {
        setAuthLock(null);
        setBusy(false);
      }
    }
  };

  const handleCancelAuth = () => {
    const requestId = authLock?.requestId;
    authSessionRef.current += 1;
    setAuthLock(null);
    setBusy(false);
    if (requestId) {
      void agentClient.cancelPlatformAuth(requestId);
    }
  };

  const openRename = (account: PlatformAccountItem) => {
    setRenameTarget(account);
    setRenameValue(account.displayName);
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
      setAuthSuccess(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : '编辑失败');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    const target = deleteTarget;
    if (!target) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await deletePlatformAccount(target.id);
      setDeleteTarget(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="媒体账号"
        description="通过蒲公英桌面端打开类 Chrome 授权窗，完成抖音 / 头条 / 视频号 / B 站 / 小红书绑定"
      />

      {error ? <FieldError>{error}</FieldError> : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <InputGroup className="min-w-0 max-w-xs flex-1">
            <InputGroupInput
              id="account-search"
              value={accountQuery}
              placeholder="搜索账号名称"
              onChange={(e) => {
                setAccountQuery(e.target.value);
                setPage(1);
              }}
            />
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            {accountQuery ? (
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  size="icon-xs"
                  variant="ghost"
                  aria-label="清除搜索"
                  onClick={() => {
                    setAccountQuery('');
                    setPage(1);
                  }}
                >
                  <XIcon />
                </InputGroupButton>
              </InputGroupAddon>
            ) : null}
          </InputGroup>
          <Select
            value={platformFilter}
            onValueChange={(value) => {
              const next = (value as PlatformFilter) ?? 'all';
              setPlatformFilter(next);
              setPage(1);
              // 显式传入 next：setState 异步，不能依赖尚未更新的 platformFilter
              void reload(next);
            }}
            items={platformFilterOptions}
          >
            <SelectTrigger className="w-36 shrink-0" aria-label="平台">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {platformFilterOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {hasSearchFilters ? (
            <Button type="button" variant="ghost" className="shrink-0" onClick={resetSearchFilters}>
              <RotateCcw data-icon="inline-start" />
              重置
            </Button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            disabled={loading || busy}
            onClick={() => {
              void reload();
            }}
          >
            <RefreshCw data-icon="inline-start" />
            刷新
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              if (!requireAgent()) {
                return;
              }
              // 从某平台筛选点「添加」时预选该平台，减少二次选择
              if (platformFilter !== 'all') {
                setSelectedPlatform(platformFilter);
              }
              setPlatformQuery('');
              setDialogOpen(true);
            }}
          >
            <Plus data-icon="inline-start" />
            添加账号
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
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
            <EmptyTitle>{platformFilter === 'all' ? '暂无媒体账号' : '该平台暂无账号'}</EmptyTitle>
            <EmptyDescription>
              {platformFilter === 'all'
                ? '点击右上角「添加账号」，通过蒲公英桌面端完成平台登录后即可绑定。'
                : `当前没有「${platformLabel(platformFilter)}」账号，可改回「全部平台」或添加该平台账号。`}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : filteredAccounts.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchIcon />
            </EmptyMedia>
            <EmptyTitle>未找到匹配账号</EmptyTitle>
            <EmptyDescription>换个关键词试试，或点「重置」清空搜索条件查看全部账号。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pagedAccounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                platformName={platformLabel(account.platform)}
                busy={busy}
                opening={openingId === account.id}
                onOpenCreator={() => {
                  void handleOpenCreator(account);
                }}
                onReauth={() => {
                  void runAuthAndBind('reauth', account.id);
                }}
                onRename={() => {
                  openRename(account);
                }}
                onDelete={() => {
                  setDeleteTarget(account);
                }}
              />
            ))}
          </div>
          {totalPages > 1 ? (
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    text="上一页"
                    aria-label="上一页"
                    aria-disabled={currentPage <= 1 || undefined}
                    className={currentPage <= 1 ? 'pointer-events-none opacity-50' : undefined}
                    onClick={(e) => {
                      e.preventDefault();
                      if (currentPage > 1) {
                        setPage(currentPage - 1);
                      }
                    }}
                  />
                </PaginationItem>
                {buildPageList(currentPage, totalPages).map((item, index) =>
                  item === 'gap' ? (
                    <PaginationItem key={`gap-${index}`}>
                      <PaginationEllipsis />
                    </PaginationItem>
                  ) : (
                    <PaginationItem key={item}>
                      <PaginationLink
                        href="#"
                        isActive={item === currentPage}
                        onClick={(e) => {
                          e.preventDefault();
                          setPage(item);
                        }}
                      >
                        {item}
                      </PaginationLink>
                    </PaginationItem>
                  ),
                )}
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    text="下一页"
                    aria-label="下一页"
                    aria-disabled={currentPage >= totalPages || undefined}
                    className={currentPage >= totalPages ? 'pointer-events-none opacity-50' : undefined}
                    onClick={(e) => {
                      e.preventDefault();
                      if (currentPage < totalPages) {
                        setPage(currentPage + 1);
                      }
                    }}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          ) : null}
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
                {platformQuery ? (
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      size="icon-xs"
                      variant="ghost"
                      aria-label="清除搜索"
                      onClick={() => {
                        setPlatformQuery('');
                      }}
                    >
                      <XIcon />
                    </InputGroupButton>
                  </InputGroupAddon>
                ) : null}
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
                // ToggleGroup 会渲染 children；勿用 outline + spacing=0（会变成连体分段边框）
                <ToggleGroup
                  aria-labelledby="platform-grid-label"
                  value={selectedPlatform ? [selectedPlatform] : []}
                  onValueChange={(values) => {
                    const next = values[0];
                    // 单选：禁止点已选项清空，避免「开始授权」无平台
                    if (next) {
                      setSelectedPlatform(next);
                    }
                  }}
                  className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3"
                >
                  {filteredCatalog.map((item) => {
                    return (
                      <ToggleGroupItem
                        key={item.id}
                        value={item.id}
                        aria-label={item.displayName}
                        className={cn(
                          'h-auto min-w-0 flex-col gap-2 rounded-xl border-0 bg-card p-4 text-sm text-foreground shadow-xs ring-1 ring-foreground/10',
                          'hover:bg-muted/50 data-pressed:bg-muted data-pressed:text-foreground data-pressed:ring-2 data-pressed:ring-ring'
                        )}
                      >
                        <PlatformIcon platform={item.id} className="size-10" />
                        <span className="truncate font-medium">{item.displayName}</span>
                      </ToggleGroupItem>
                    );
                  })}
                </ToggleGroup>
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
              disabled={!selectedPlatform || busy}
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

      <Dialog
        open={authLock !== null}
        onOpenChange={(open, eventDetails) => {
          if (!open) {
            // Esc / backdrop cannot dismiss; use the explicit exit action below.
            eventDetails.cancel();
          }
        }}
      >
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{authLock?.mode === 'reauth' ? '正在重新授权' : '正在添加账号'}</DialogTitle>
            <DialogDescription>
              {authLock
                ? `请在桌面授权窗完成「${authLock.platformName}」登录。登录成功后会自动继续；若长时间无反应，可在授权窗点击「完成授权」。`
                : null}
            </DialogDescription>
          </DialogHeader>
          {authLock ? (
            <ol className="flex flex-col gap-3 py-1">
              {AUTH_STEPS.map((step) => {
                const status = authStepStatus(step.id, authLock.phase);
                return (
                  <li key={step.id} className="flex items-start gap-3">
                    <span
                      className={cn(
                        'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs',
                        status === 'done' && 'border-primary bg-primary text-primary-foreground',
                        status === 'current' && 'border-primary text-primary',
                        status === 'pending' && 'border-muted-foreground/30 text-muted-foreground'
                      )}
                    >
                      {status === 'done' ? (
                        <Check className="size-3.5" />
                      ) : status === 'current' ? (
                        <Spinner className="size-3.5" />
                      ) : (
                        <span className="size-1.5 rounded-full bg-current opacity-40" />
                      )}
                    </span>
                    <div className="min-w-0 pt-0.5">
                      <p className={cn('text-sm font-medium', status === 'pending' && 'text-muted-foreground')}>{step.label(authLock.platformName)}</p>
                      {status === 'current' && step.id === 'login' ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {authLock.phase === 'finishing' ? '正在读取账号资料…' : '在 Agent 窗口登录目标账号'}
                        </p>
                      ) : null}
                      {status === 'current' && step.id === 'bind' ? <p className="mt-0.5 text-xs text-muted-foreground">正在加密保存登录凭证…</p> : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : null}
          <DialogFooter className="sm:justify-center">
            <Button variant="outline" onClick={handleCancelAuth}>
              退出授权
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={authSuccess !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAuthSuccess(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          {authSuccess ? (
            <>
              <DialogHeader>
                <DialogTitle>{authSuccess.mode === 'reauth' ? '重新授权成功' : '账号添加成功'}</DialogTitle>
                <DialogDescription>
                  {authSuccess.weakProfile
                    ? '已保存登录凭证，但未能读取到平台昵称。建议现在设置一个便于识别的名称。'
                    : '登录凭证已加密保存，可在列表中查看或打开创作者中心。'}
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center gap-3 rounded-xl bg-muted/50 px-3 py-3">
                <Avatar size="lg">
                  {authSuccess.account.avatarUrl ? (
                    <AvatarImage src={authSuccess.account.avatarUrl} alt={authSuccess.account.displayName} referrerPolicy="no-referrer" />
                  ) : null}
                  <AvatarFallback>{authSuccess.account.displayName.slice(0, 1)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate font-medium" title={authSuccess.account.displayName}>
                    {authSuccess.account.displayName}
                  </p>
                  <p className="text-xs text-muted-foreground">{authSuccess.platformName}</p>
                </div>
              </div>
              <DialogFooter>
                {authSuccess.weakProfile ? (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setAuthSuccess(null);
                      }}
                    >
                      稍后再说
                    </Button>
                    <Button
                      onClick={() => {
                        const account = authSuccess.account;
                        setAuthSuccess(null);
                        openRename(account);
                      }}
                    >
                      修改名称
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={() => {
                      setAuthSuccess(null);
                    }}
                  >
                    完成
                  </Button>
                )}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>删除媒体账号？</AlertDialogTitle>
            <AlertDialogDescription>{deleteTarget ? `将删除「${deleteTarget.displayName}」。删除后需重新授权才能发布到该账号。` : null}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={() => {
                void handleDelete();
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AgentNeededDialog open={agentNeededOpen} onOpenChange={setAgentNeededOpen} />
    </div>
  );
}

function AccountCard({
  account,
  platformName,
  busy,
  opening,
  onOpenCreator,
  onReauth,
  onRename,
  onDelete,
}: {
  account: PlatformAccountItem;
  platformName: string;
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
    // 不受名称/平台文本行数影响（作品管理页曾踩过的坑）。
    <Card className="h-full gap-3">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar size="lg">
              {account.avatarUrl ? <AvatarImage src={account.avatarUrl} alt={account.displayName} referrerPolicy="no-referrer" /> : null}
              <AvatarFallback>{account.displayName.slice(0, 1)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="flex min-w-0 items-center gap-1.5 font-medium">
                <span className="truncate" title={account.displayName}>
                  {account.displayName}
                </span>
                <Badge variant={status.variant} className={cn('font-normal', status.className)}>
                  {status.label}
                </Badge>
              </p>
            </div>
          </div>
          <span className="shrink-0" title={platformName} aria-label={platformName}>
            <PlatformIcon platform={account.platform} className="size-5 rounded-md" />
          </span>
        </div>
      </CardContent>
      <CardFooter className="mt-auto items-center justify-between gap-2">
        <p className="min-w-0 truncate text-muted-foreground" title={formatAbsoluteTime(account.lastAuthedAt)}>
          最近授权 {formatRelativeTime(account.lastAuthedAt)}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          {needsReauth ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={busy}
                    aria-label="重新授权"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={onReauth}
                  />
                }
              >
                <Link2 />
              </TooltipTrigger>
              <TooltipContent>重新授权</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={busy || opening}
                    aria-label={opening ? '打开中' : '打开创作者中心'}
                    onClick={onOpenCreator}
                  />
                }
              >
                {opening ? <Spinner /> : <ExternalLink />}
              </TooltipTrigger>
              <TooltipContent>{opening ? '打开中…' : '打开创作者中心'}</TooltipContent>
            </Tooltip>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" disabled={busy} />}>
              <MoreHorizontal />
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
        </div>
      </CardFooter>
    </Card>
  );
}
