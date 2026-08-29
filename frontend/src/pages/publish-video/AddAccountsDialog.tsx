import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, SearchIcon, XIcon } from 'lucide-react';
import { AgentNeededDialog } from '@/components/AgentNeededDialog';
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
import { FieldError } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Spinner } from '@/components/ui/spinner';
import { useAgent } from '@/hooks/use-agent';
import { agentClient, type PlatformAuthProgressPhase } from '@/lib/agent-client';
import { reauthPlatformAccount, type PlatformAccountItem, type PlatformCatalogItem, type PlatformId } from '@/lib/api';
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

type AuthPhase = 'opening' | PlatformAuthProgressPhase | 'binding';

type AuthLockState = {
  platformName: string;
  requestId: string;
  phase: AuthPhase;
};

const AUTH_ERROR_TEXT: Record<string, string> = {
  invalid_payload: '请求参数不完整',
  duplicate_request_id: '已有进行中的授权，请先完成或退出后再试',
  not_found: '授权会话已结束，请重新开始',
};

function authErrorText(code: string | undefined): string {
  if (!code) {
    return '授权失败';
  }
  if (code.startsWith('unsupported_platform')) {
    return '当前 Agent 版本不支持该平台，请升级 Agent';
  }
  return AUTH_ERROR_TEXT[code] ?? `授权失败（${code}）`;
}

function createAuthRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `auth-${crypto.randomUUID()}`;
  }
  return `auth-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const AUTH_STEPS: Array<{ id: 'open' | 'login' | 'bind'; label: (platformName: string) => string }> = [
  { id: 'open', label: () => '打开授权窗口' },
  { id: 'login', label: (platformName) => `在 Agent 登录「${platformName}」` },
  { id: 'bind', label: () => '保存到蒲公英' },
];

function authStepStatus(stepId: 'open' | 'login' | 'bind', phase: AuthPhase): 'done' | 'current' | 'pending' {
  const currentStep =
    phase === 'opening' ? 0 : phase === 'window_opened' || phase === 'awaiting_login' || phase === 'finishing' ? 1 : 2;
  const stepIndex = stepId === 'open' ? 0 : stepId === 'login' ? 1 : 2;
  if (stepIndex < currentStep) {
    return 'done';
  }
  if (stepIndex === currentStep) {
    return 'current';
  }
  return 'pending';
}

/**
 * 选择分发账号：左栏平台、右栏账号卡片（头像 + 昵称）。
 * 打开时同步当前已选；确认后一次性写回，避免边选边改左侧列表。
 * 失效账号可在此重新登录，成功后写回父级列表并自动勾选。
 */
export function AddAccountsDialog({
  open,
  onOpenChange,
  catalog,
  accounts,
  selected,
  onConfirm,
  onAccountUpdated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: PlatformCatalogItem[];
  accounts: PlatformAccountItem[];
  selected: Record<string, boolean>;
  onConfirm: (nextSelected: Record<string, boolean>) => void;
  /** 重新授权成功后更新父级账号列表（头像/状态等） */
  onAccountUpdated: (account: PlatformAccountItem) => void;
}) {
  const { connected } = useAgent();
  const [platformFocus, setPlatformFocus] = useState<PlatformId | 'all'>('all');
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState('');
  const [agentNeededOpen, setAgentNeededOpen] = useState(false);
  const [authLock, setAuthLock] = useState<AuthLockState | null>(null);
  const [authError, setAuthError] = useState('');
  const [reauthingId, setReauthingId] = useState<string | null>(null);
  const authSessionRef = useRef(0);

  useEffect(() => {
    if (!open) {
      return;
    }
    setDraft({ ...selected });
    setPlatformFocus(catalog[0]?.id ?? 'all');
    setQuery('');
    setAuthError('');
  }, [open, selected, catalog]);

  const platformAccounts = useMemo(() => {
    const byPlatform =
      platformFocus === 'all' ? accounts : accounts.filter((account) => account.platform === platformFocus);
    return byPlatform.filter((account) => matchAccountQuery(account, query));
  }, [accounts, platformFocus, query]);

  const draftCount = Object.values(draft).filter(Boolean).length;
  const hasQuery = query.trim().length > 0;
  const authBusy = authLock !== null;

  const toggleAccount = (account: PlatformAccountItem) => {
    if (account.status !== 'active') {
      return;
    }
    setDraft((prev) => ({
      ...prev,
      [account.id]: !prev[account.id],
    }));
  };

  const handleCancelAuth = () => {
    const requestId = authLock?.requestId;
    authSessionRef.current += 1;
    setAuthLock(null);
    setReauthingId(null);
    if (requestId) {
      void agentClient.cancelPlatformAuth(requestId);
    }
  };

  const runReauth = async (account: PlatformAccountItem) => {
    if (!connected) {
      setAgentNeededOpen(true);
      return;
    }
    const meta = catalog.find((item) => item.id === account.platform);
    const platformName = meta?.displayName ?? account.platform;
    const requestId = createAuthRequestId();
    const session = ++authSessionRef.current;
    setAuthError('');
    setReauthingId(account.id);
    setAuthLock({ platformName, requestId, phase: 'opening' });
    try {
      const result = await agentClient.startPlatformAuth({
        platform: account.platform,
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
      const bound = await reauthPlatformAccount(account.id, {
        cookies: result.cookies,
        finalUrl: result.finalUrl,
        profile: result.profile,
      });
      if (session !== authSessionRef.current) {
        return;
      }
      onAccountUpdated(bound);
      // 重新登录成功后自动勾选，便于直接加入分发
      setDraft((prev) => ({
        ...prev,
        [bound.id]: true,
      }));
    } catch (err) {
      if (session !== authSessionRef.current) {
        return;
      }
      setAuthError(err instanceof Error ? err.message : '重新登录失败');
    } finally {
      if (session === authSessionRef.current) {
        setAuthLock(null);
        setReauthingId(null);
      }
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (authBusy) {
            return;
          }
          onOpenChange(next);
          if (!next) {
            setQuery('');
            setAuthError('');
          }
        }}
      >
        <DialogContent className="flex h-[min(640px,80vh)] flex-col gap-4 overflow-hidden sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>添加分发账号</DialogTitle>
            <DialogDescription>选择要推送的媒体账号；失效账号可重新登录后再勾选。</DialogDescription>
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
                    disabled={authBusy}
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
                      disabled={authBusy || !hasQuery}
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
                        const usable = account.status === 'active';
                        const isSelected = Boolean(draft[account.id]);
                        const isReauthing = reauthingId === account.id;
                        return (
                          <div
                            key={account.id}
                            className={cn(
                              'relative flex items-center gap-3 rounded-xl bg-muted/50 p-3 text-left transition-colors',
                              usable ? 'hover:bg-muted' : null,
                              usable && isSelected ? 'bg-primary/10 hover:bg-primary/15' : null
                            )}
                          >
                            {usable ? (
                              <button
                                type="button"
                                aria-pressed={isSelected}
                                disabled={authBusy}
                                className="absolute inset-0 rounded-xl"
                                onClick={() => {
                                  toggleAccount(account);
                                }}
                              >
                                <span className="sr-only">选择 {account.displayName}</span>
                              </button>
                            ) : null}
                            {usable && isSelected ? (
                              <span className="pointer-events-none absolute top-2 right-2 z-10 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                <Check className="size-3" aria-hidden />
                              </span>
                            ) : null}
                            <Avatar size="lg" className="relative z-10">
                              {account.avatarUrl ? (
                                <AvatarImage src={account.avatarUrl} alt={account.displayName} referrerPolicy="no-referrer" />
                              ) : null}
                              <AvatarFallback>{account.displayName.slice(0, 1)}</AvatarFallback>
                            </Avatar>
                            <div className="relative z-10 min-w-0 flex-1 pr-1">
                              <p className="truncate font-medium" title={account.displayName}>
                                {account.displayName}
                              </p>
                              {!usable ? (
                                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                  <Badge variant="outline" className="font-normal">
                                    {ACCOUNT_STATUS_TEXT[account.status]}
                                  </Badge>
                                  <Button
                                    type="button"
                                    size="xs"
                                    variant="outline"
                                    disabled={authBusy}
                                    onClick={() => {
                                      void runReauth(account);
                                    }}
                                  >
                                    {isReauthing ? (
                                      <>
                                        <Spinner data-icon="inline-start" />
                                        登录中
                                      </>
                                    ) : (
                                      '重新登录'
                                    )}
                                  </Button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>

          {authError ? <FieldError>{authError}</FieldError> : null}

          <DialogFooter className="sm:justify-between">
            <p className="text-muted-foreground">已选 {draftCount} 个账号</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button
                variant="outline"
                disabled={authBusy}
                onClick={() => {
                  onOpenChange(false);
                }}
              >
                取消
              </Button>
              <Button
                disabled={authBusy}
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

      <Dialog
        open={authLock !== null}
        onOpenChange={(next, eventDetails) => {
          if (!next) {
            // Esc / 点击遮罩不可关，须点「退出授权」以免 Agent 窗仍挂起
            eventDetails.cancel();
          }
        }}
      >
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>正在重新登录</DialogTitle>
            <DialogDescription>
              {authLock
                ? `请前往桌面 Agent 完成「${authLock.platformName}」登录。登录成功后会自动继续；若长时间无反应，可在 Agent 窗口点击「完成授权」。`
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
                      <p className={cn('text-sm font-medium', status === 'pending' && 'text-muted-foreground')}>
                        {step.label(authLock.platformName)}
                      </p>
                      {status === 'current' && step.id === 'login' ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {authLock.phase === 'finishing' ? '正在读取账号资料…' : '在 Agent 窗口登录目标账号'}
                        </p>
                      ) : null}
                      {status === 'current' && step.id === 'bind' ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">正在加密保存登录凭证…</p>
                      ) : null}
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

      <AgentNeededDialog open={agentNeededOpen} onOpenChange={setAgentNeededOpen} />
    </>
  );
}
