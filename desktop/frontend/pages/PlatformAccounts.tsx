import { useEffect, useRef, useState } from "react";
import type { AccountSessionHealth } from "@shared/account-session";
import {
  Check,
  CircleDot,
  Copy,
  ExternalLink,
  Layers,
  Link2,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  SearchIcon,
  Trash2,
  XIcon,
} from "lucide-react";
import { PageHeader } from "@/components/layouts/PageHeader";
import { FilterSelect } from "@/components/FilterSelect";
import { PlatformIcon } from "@/components/PlatformIcon";
import { toast } from "@/components/AppToaster";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AgentNeededDialog } from "@/components/AgentNeededDialog";
import { useAgent } from "@/hooks/use-agent";
import { PLATFORM_ACCOUNT_SYNCED_EVENT } from "@/hooks/use-creator-window-sync";
import {
  agentClient,
  type AgentCookie,
  type PlatformAuthProgressPhase,
} from "@/lib/agent-client";
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
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { checkAccountSessions } from "@/lib/account-session";
import { formatRelativeTime, formatTimeUntil } from "@/lib/relative-time";

/** 列表筛选：全部 + 平台目录中的各平台 */
type PlatformFilter = "all" | PlatformId;
type StatusFilter = "all" | AccountHealthView;

/** 卡片展示的授权状态：已授权 / 即将过期 / 已失效 */
type AccountHealthView = "active" | "expiring" | "invalid";

const STATUS_FILTER_OPTIONS: Array<{
  value: AccountHealthView;
  label: string;
}> = [
  { value: "active", label: "已授权" },
  { value: "expiring", label: "即将过期" },
  { value: "invalid", label: "已失效" },
];

/** 账号状态 + 后台登录检测结果 → 展示状态。检测未完成或无法判断时沿用账号状态。 */
export function accountHealthView(
  account: Pick<PlatformAccountItem, "status">,
  health: AccountSessionHealth | undefined,
): AccountHealthView {
  if (account.status !== "active" || health?.state === "invalid") {
    return "invalid";
  }
  return health?.state === "expiring" ? "expiring" : "active";
}

/** 每页 12 个账号。 */
const ACCOUNT_PAGE_SIZE = 12;

type AuthPhase = "opening" | PlatformAuthProgressPhase | "binding";

type AuthLockState = {
  mode: "create" | "reauth";
  platformName: string;
  accountName?: string;
  requestId: string;
  phase: AuthPhase;
};

type AuthSuccessState = {
  account: PlatformAccountItem;
  platformName: string;
};

function createAuthRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `auth-${crypto.randomUUID()}`;
  }
  return `auth-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const OPEN_ERROR_TEXT: Record<string, string> = {
  invalid_payload: "暂时无法完成，请重试",
  missing_cookies: "请先重新授权该账号",
};

/** Server 解密 Cookie 失败等（勿把英文/内部措辞直接甩给用户） */
const CREDENTIAL_ERROR_TEXT = [
  "请先重新授权该账号",
  "无法读取已保存的登录信息，请重新授权",
  "没有可用的登录信息，请重新授权",
  "本机凭据密钥未配置，无法打开已绑定账号；请检查开发环境配置后重试",
] as const;

const AUTH_ERROR_TEXT: Record<string, string> = {
  invalid_payload: "暂时无法完成，请重试",
  duplicate_request_id: "已有进行中的授权，请先完成或退出后再试",
  not_found: "授权会话已结束，请重新开始",
};

function openErrorText(code: string | undefined): string {
  if (!code) {
    return "打开创作者中心失败";
  }
  if (code.startsWith("unsupported_platform")) {
    return "当前桌面端版本不支持该平台，请升级应用";
  }
  return OPEN_ERROR_TEXT[code] ?? "打开创作者中心失败，请重试";
}

function authErrorText(code: string | undefined): string {
  if (!code) {
    return "授权失败";
  }
  if (code.startsWith("unsupported_platform")) {
    return "当前桌面端版本不支持该平台，请升级应用";
  }
  return AUTH_ERROR_TEXT[code] ?? "授权失败，请重试";
}

// Only show messages deliberately written for this page; other errors stay generic.
function accountErrorText(error: unknown, fallback: string): string {
  const messages = [
    ...Object.values(OPEN_ERROR_TEXT),
    ...Object.values(AUTH_ERROR_TEXT),
    ...CREDENTIAL_ERROR_TEXT,
    "当前桌面端版本不支持该平台，请升级应用",
    "打开创作者中心失败，请重试",
    "授权失败，请重试",
    "授权超时",
    "未能确认登录账号，请重新授权",
    "登录账号与原账号不同，请使用原账号重新授权",
    "该账号已添加，请在对应账号上重新授权",
  ];
  if (!(error instanceof Error)) {
    return fallback;
  }
  // 旧英文错误体仍映射为重新授权，避免开发态密钥不匹配时只见泛化失败
  if (
    /unreadable|reauthorize|No stored cookies|PLATFORM_CREDENTIAL_SECRET/i.test(
      error.message,
    )
  ) {
    return "无法读取已保存的登录信息，请重新授权";
  }
  return messages.includes(error.message) ? error.message : fallback;
}

const AUTH_STEPS: Array<{
  id: "open" | "login" | "bind";
  label: (platformName: string) => string;
}> = [
  { id: "open", label: () => "打开授权窗口" },
  { id: "login", label: (platformName) => `在授权窗口登录「${platformName}」` },
  { id: "bind", label: () => "保存到蒲公英" },
];

function authStepStatus(
  stepId: "open" | "login" | "bind",
  phase: AuthPhase,
): "done" | "current" | "pending" {
  const currentStep =
    phase === "opening"
      ? 0
      : phase === "window_opened" ||
          phase === "awaiting_login" ||
          phase === "finishing"
        ? 1
        : 2;
  const stepIndex = stepId === "open" ? 0 : stepId === "login" ? 1 : 2;
  if (stepIndex < currentStep) {
    return "done";
  }
  if (stepIndex === currentStep) {
    return "current";
  }
  return "pending";
}

/** 悬停 title 用完整时间，便于核对精确时刻 */
function formatAbsoluteTime(value: string | null): string {
  if (!value) {
    return "—";
  }
  try {
    return new Date(value).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return value;
  }
}

/** 生成带省略号的页码序列，避免页数多时撑爆底栏 */
function buildPageList(current: number, total: number): Array<number | "gap"> {
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
  const result: Array<number | "gap"> = [];
  for (let i = 0; i < sorted.length; i++) {
    const page = sorted[i]!;
    if (i > 0 && page - sorted[i - 1]! > 1) {
      result.push("gap");
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
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [authLock, setAuthLock] = useState<AuthLockState | null>(null);
  const [authSuccess, setAuthSuccess] = useState<AuthSuccessState | null>(null);
  const authSessionRef = useRef(0);
  const [openingIds, setOpeningIds] = useState<Set<string>>(() => new Set());
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  const [accountQuery, setAccountQuery] = useState("");
  const [sessions, setSessions] = useState<
    Record<string, AccountSessionHealth>
  >({});
  const searchRef = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState(1);
  const [renameTarget, setRenameTarget] = useState<PlatformAccountItem | null>(
    null,
  );
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<PlatformAccountItem | null>(
    null,
  );
  const [agentNeededOpen, setAgentNeededOpen] = useState(false);

  const platformLabel = (id: string) =>
    catalog.find((item) => item.id === id)?.displayName ?? id;

  // Keep all accounts loaded so filtering never replaces the list with skeletons.
  const filteredAccounts = accounts.filter((account) => {
    if (platformFilter !== "all" && account.platform !== platformFilter) {
      return false;
    }
    if (
      statusFilter !== "all" &&
      accountHealthView(account, sessions[account.id]) !== statusFilter
    ) {
      return false;
    }
    const q = accountQuery.trim().toLowerCase();
    if (!q) {
      return true;
    }
    if (
      account.displayName.toLowerCase().includes(q) ||
      account.platformNickname?.toLowerCase().includes(q)
    ) {
      return true;
    }
    if (account.platformUserId?.toLowerCase().includes(q)) {
      return true;
    }
    // 也匹配平台名，方便在「全部」下用「抖音」等关键词缩小范围
    return platformLabel(account.platform).toLowerCase().includes(q);
  });
  const totalPages = Math.max(
    1,
    Math.ceil(filteredAccounts.length / ACCOUNT_PAGE_SIZE),
  );
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

  // 关键词或平台任一偏离默认时，允许一键重置
  const hasSearchFilters =
    Boolean(accountQuery.trim()) ||
    platformFilter !== "all" ||
    statusFilter !== "all";

  const loadSeqRef = useRef(0);
  const reload = async () => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    setError("");
    try {
      const [platforms, list] = await Promise.all([
        fetchPlatformCatalog(),
        fetchPlatformAccounts(),
      ]);
      if (seq !== loadSeqRef.current) {
        return;
      }
      setCatalog(platforms);
      setAccounts(list);
      setHasLoaded(true);
    } catch {
      if (seq !== loadSeqRef.current) {
        return;
      }
      setError("账号加载失败，请重试");
    } finally {
      if (seq === loadSeqRef.current) {
        setLoading(false);
      }
    }
  };

  const resetSearchFilters = () => {
    setAccountQuery("");
    setPlatformFilter("all");
    setStatusFilter("all");
    setPage(1);
    // 清除后「清除全部」变为禁用，焦点移到搜索框，便于继续输入
    searchRef.current?.focus();
  };

  // 后台登录检测：不阻塞列表渲染；主进程按账号 10 分钟节流
  const accountIdsKey = accounts.map((account) => account.id).join(",");
  useEffect(() => {
    if (!accountIdsKey) {
      return;
    }
    let alive = true;
    void checkAccountSessions(accountIdsKey.split(",")).then((results) => {
      if (!alive || results.length === 0) {
        return;
      }
      setSessions((previous) => {
        const next = { ...previous };
        for (const result of results) {
          next[result.accountId] = result;
        }
        return next;
      });
    });
    return () => {
      alive = false;
    };
  }, [accountIdsKey]);

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

  useEffect(() => {
    if (!highlightedId) {
      return;
    }
    document
      .getElementById(`account-${highlightedId}`)
      ?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    const timer = setTimeout(() => setHighlightedId(null), 6000);
    return () => clearTimeout(timer);
  }, [highlightedId]);

  const clearCardError = (id: string) => {
    setCardErrors((previous) => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
  };

  const invalidateReload = () => {
    // An in-flight list read must not undo a newer successful mutation.
    loadSeqRef.current += 1;
    setLoading(false);
  };

  const revealAccount = (account: PlatformAccountItem) => {
    invalidateReload();
    // The mutation result is authoritative, even if the following refresh fails.
    const next = accounts.some((item) => item.id === account.id)
      ? accounts.map((item) => (item.id === account.id ? account : item))
      : [account, ...accounts];
    setAccounts(next);
    setPlatformFilter("all");
    setStatusFilter("all");
    setAccountQuery("");
    setPage(
      Math.floor(
        next.findIndex((item) => item.id === account.id) / ACCOUNT_PAGE_SIZE,
      ) + 1,
    );
    clearCardError(account.id);
    setHighlightedId(account.id);
  };

  const handleOpenCreator = async (account: PlatformAccountItem) => {
    if (!requireAgent()) {
      return;
    }
    setOpeningIds((previous) => new Set(previous).add(account.id));
    clearCardError(account.id);
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
      setCardErrors((previous) => ({
        ...previous,
        [account.id]: accountErrorText(err, "打开创作者中心失败，请重试"),
      }));
    } finally {
      setOpeningIds((previous) => {
        const next = new Set(previous);
        next.delete(account.id);
        return next;
      });
    }
  };

  /**
   * 发起平台授权并落库。
   * create：target 为平台 id（来自添加下拉）；reauth：target 为已有账号 id。
   */
  const runAuthAndBind = async (mode: "create" | "reauth", target: string) => {
    if (busy || !requireAgent()) {
      return;
    }
    const platform =
      mode === "create"
        ? target
        : accounts.find((a) => a.id === target)?.platform;
    if (!platform) {
      toast.add({
        type: "error",
        title: mode === "create" ? "请选择平台" : "账号已移除，请刷新",
      });
      return;
    }

    const meta = catalog.find((item) => item.id === platform);
    const platformName = meta?.displayName ?? platformLabel(platform);
    const requestId = createAuthRequestId();
    const session = ++authSessionRef.current;
    setBusy(true);
    if (mode === "reauth") {
      clearCardError(target);
    }
    setAuthSuccess(null);
    setAddMenuOpen(false);
    setAuthLock({
      mode,
      platformName,
      accountName:
        mode === "reauth"
          ? accounts.find((item) => item.id === target)?.displayName
          : undefined,
      requestId,
      phase: "opening",
    });
    try {
      const result = await agentClient.startPlatformAuth({
        platform,
        loginUrl: meta?.loginUrl,
        requestId,
        onProgress: (progress) => {
          if (session !== authSessionRef.current) {
            return;
          }
          setAuthLock((prev) =>
            prev && prev.requestId === requestId
              ? { ...prev, phase: progress.phase }
              : prev,
          );
        },
      });
      if (session !== authSessionRef.current) {
        return;
      }
      if (!result.ok || !result.cookies?.length) {
        if (result.error === "cancelled" || result.error === "window_closed") {
          return;
        }
        throw new Error(authErrorText(result.error));
      }

      setAuthLock((prev) =>
        prev && prev.requestId === requestId
          ? { ...prev, phase: "binding" }
          : prev,
      );

      let bound: PlatformAccountItem;
      if (mode === "reauth") {
        bound = await reauthPlatformAccount(target, {
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
      revealAccount(bound);
      if (mode === "reauth") {
        setSessions((previous) => {
          const next = { ...previous };
          delete next[bound.id];
          return next;
        });
        void checkAccountSessions([bound.id], { force: true }).then(
          (results) => {
            const [result] = results;
            if (result) {
              setSessions((previous) => ({
                ...previous,
                [result.accountId]: result,
              }));
            }
          },
        );
      }
      toast.add({
        type: "success",
        title: mode === "reauth" ? "已重新授权" : "账号已添加",
      });
      if (
        mode === "create" &&
        (bound.displayName === `${platformName}账号` ||
          bound.displayName === bound.platformUserId)
      ) {
        setAuthSuccess({ account: bound, platformName });
      }
      void reload();
    } catch (err) {
      if (session !== authSessionRef.current) {
        return;
      }
      const message = accountErrorText(err, "授权失败，请重试");
      toast.add({ type: "error", title: message });
      if (mode === "reauth") {
        setCardErrors((previous) => ({ ...previous, [target]: message }));
      }
    } finally {
      if (session === authSessionRef.current) {
        setAuthLock(null);
        setBusy(false);
      }
    }
  };

  const handleCancelAuth = () => {
    if (authLock?.phase === "binding") {
      return;
    }
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
    setRenameError("");
  };

  const handleRename = async () => {
    const target = renameTarget;
    const next = renameValue.trim();
    if (!target || !next || busy) {
      return;
    }
    setBusy(true);
    setRenameError("");
    try {
      const renamed = await renamePlatformAccount(target.id, next);
      invalidateReload();
      setAccounts((previous) =>
        previous.map((item) => (item.id === renamed.id ? renamed : item)),
      );
      toast.add({ type: "success", title: "名称已修改" });
      setRenameTarget(null);
      setAuthSuccess(null);
    } catch {
      setRenameError("名称修改失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    const target = deleteTarget;
    if (!target || busy) {
      return;
    }
    setBusy(true);
    setDeleteError("");
    try {
      await deletePlatformAccount(target.id);
      invalidateReload();
      setDeleteTarget(null);
      setAccounts((previous) =>
        previous.filter((item) => item.id !== target.id),
      );
      const remainingCount = filteredAccounts.filter(
        (item) => item.id !== target.id,
      ).length;
      setPage((previous) =>
        Math.min(
          previous,
          Math.max(1, Math.ceil(remainingCount / ACCOUNT_PAGE_SIZE)),
        ),
      );
      clearCardError(target.id);
      toast.add({ type: "success", title: "账号已移除" });
    } catch {
      setDeleteError("账号移除失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="媒体账号" description="绑定各平台账号，发布时选用。" />

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>{error}</AlertTitle>
          <AlertDescription>
            <Button
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => {
                void reload();
              }}
            >
              {loading ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <RefreshCw data-icon="inline-start" />
              )}
              重试
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {/* 与分发队列一致：搜索在最左占满剩余宽度，筛选定宽，清除全部常驻；操作时左侧不跳动 */}
      <div className="flex flex-nowrap items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-2">
          <InputGroup className="h-9 min-w-0 flex-1">
            <InputGroupInput
              ref={searchRef}
              id="account-search"
              value={accountQuery}
              placeholder="搜索名称或账号 ID"
              aria-label="搜索账号"
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
                    setAccountQuery("");
                    setPage(1);
                  }}
                >
                  <XIcon />
                </InputGroupButton>
              </InputGroupAddon>
            ) : null}
          </InputGroup>
          <FilterSelect
            triggerClassName="w-44"
            name="平台"
            icon={<Layers />}
            value={platformFilter === "all" ? "" : platformFilter}
            options={catalog.map((item) => ({
              value: item.id,
              label: item.displayName,
              icon: (
                <PlatformIcon
                  platform={item.id}
                  alt=""
                  aria-hidden="true"
                  className="size-4 rounded-sm"
                />
              ),
            }))}
            onChange={(value) => {
              setPlatformFilter((value || "all") as PlatformFilter);
              setPage(1);
            }}
          />
          <FilterSelect
            triggerClassName="w-44"
            name="状态"
            icon={<CircleDot />}
            value={statusFilter === "all" ? "" : statusFilter}
            options={STATUS_FILTER_OPTIONS}
            onChange={(value) => {
              setStatusFilter((value || "all") as StatusFilter);
              setPage(1);
            }}
          />
          <Button
            type="button"
            variant="ghost"
            className="h-9 shrink-0"
            disabled={!hasSearchFilters}
            onClick={resetSearchFilters}
          >
            清除全部
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            disabled={loading || busy}
            onClick={() => {
              void reload();
            }}
          >
            {loading ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <RefreshCw data-icon="inline-start" />
            )}
            刷新
          </Button>
          <DropdownMenu
            open={addMenuOpen}
            onOpenChange={(open) => {
              // 未连接桌面端时先提示，不展开空菜单
              if (open && !requireAgent()) {
                return;
              }
              setAddMenuOpen(open);
            }}
          >
            <DropdownMenuTrigger
              render={<Button disabled={busy || catalog.length === 0} />}
            >
              <Plus data-icon="inline-start" />
              添加账号
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44">
              <DropdownMenuGroup>
                {catalog.map((item) => (
                  <DropdownMenuItem
                    key={item.id}
                    onClick={() => {
                      void runAuthAndBind("create", item.id);
                    }}
                  >
                    <PlatformIcon
                      platform={item.id}
                      alt=""
                      aria-hidden="true"
                      className="size-4 rounded-sm"
                    />
                    {item.displayName}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {loading && !hasLoaded ? (
        <div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          aria-label="正在加载账号"
          aria-busy="true"
        >
          {Array.from({ length: 3 }).map((_, index) => (
            <Card key={index}>
              <CardHeader>
                <Skeleton className="h-10 w-2/3" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-1/2" />
              </CardContent>
              <CardFooter>
                <Skeleton className="h-8 w-full" />
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : !hasLoaded ? null : filteredAccounts.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              {hasSearchFilters ? <SearchIcon /> : <Link2 />}
            </EmptyMedia>
            <EmptyTitle>
              {hasSearchFilters ? "未找到匹配账号" : "暂无媒体账号"}
            </EmptyTitle>
            <EmptyDescription>
              {hasSearchFilters
                ? "试试其他筛选条件，或查看全部账号。"
                : "添加平台账号，即可在发布时选用。"}
            </EmptyDescription>
          </EmptyHeader>
          <div className="flex items-center gap-2">
            {hasSearchFilters ? (
              <Button variant="outline" onClick={resetSearchFilters}>
                查看全部账号
              </Button>
            ) : null}
            <Button
              disabled={busy || catalog.length === 0}
              onClick={() => {
                if (requireAgent()) {
                  setAddMenuOpen(true);
                }
              }}
            >
              <Plus data-icon="inline-start" />
              添加账号
            </Button>
          </div>
        </Empty>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pagedAccounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                health={sessions[account.id]}
                platformName={platformLabel(account.platform)}
                busy={busy}
                opening={openingIds.has(account.id)}
                highlighted={highlightedId === account.id}
                error={cardErrors[account.id]}
                onOpenCreator={() => {
                  void handleOpenCreator(account);
                }}
                onReauth={() => {
                  void runAuthAndBind("reauth", account.id);
                }}
                onRename={() => {
                  openRename(account);
                }}
                onDelete={() => {
                  setDeleteError("");
                  setDeleteTarget(account);
                }}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p
              className="shrink-0 text-sm text-muted-foreground"
              role="status"
              aria-label="分页信息"
            >
              共 {filteredAccounts.length} 个账号 · 第 {currentPage} /{" "}
              {totalPages} 页
            </p>
            {totalPages > 1 ? (
              <Pagination className="mx-0 w-auto" aria-label="账号分页">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      text="上一页"
                      aria-label="上一页"
                      tabIndex={currentPage <= 1 ? -1 : undefined}
                      aria-disabled={currentPage <= 1 || undefined}
                      className={
                        currentPage <= 1
                          ? "pointer-events-none opacity-50"
                          : undefined
                      }
                      onClick={(e) => {
                        e.preventDefault();
                        if (currentPage > 1) {
                          setPage(currentPage - 1);
                        }
                      }}
                    />
                  </PaginationItem>
                  {buildPageList(currentPage, totalPages).map((item, index) =>
                    item === "gap" ? (
                      <PaginationItem key={`gap-${index}`}>
                        <PaginationEllipsis />
                      </PaginationItem>
                    ) : (
                      <PaginationItem key={item}>
                        <PaginationLink
                          href="#"
                          isActive={item === currentPage}
                          aria-label={`第 ${item} 页`}
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
                      tabIndex={currentPage >= totalPages ? -1 : undefined}
                      aria-disabled={currentPage >= totalPages || undefined}
                      className={
                        currentPage >= totalPages
                          ? "pointer-events-none opacity-50"
                          : undefined
                      }
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
        </div>
      )}

      <Dialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setRenameTarget(null);
          }
        }}
      >
        <DialogContent showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>修改名称</DialogTitle>
            <DialogDescription>
              仅用于蒲公英内识别，不会修改平台昵称。
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="gap-4 py-2">
            <Field data-invalid={Boolean(renameError) || undefined}>
              <FieldLabel htmlFor="rename-account">账号名称</FieldLabel>
              <Input
                id="rename-account"
                value={renameValue}
                autoFocus
                disabled={busy}
                aria-invalid={Boolean(renameError) || undefined}
                placeholder="账号名称"
                onChange={(e) => {
                  setRenameValue(e.target.value);
                  setRenameError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    void handleRename();
                  }
                }}
              />
              {renameError ? <FieldError>{renameError}</FieldError> : null}
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
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
              {busy ? <Spinner data-icon="inline-start" /> : null}
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
            <DialogTitle>
              {authLock?.mode === "reauth" ? "正在重新授权" : "正在添加账号"}
            </DialogTitle>
            <DialogDescription>
              {authLock
                ? authLock.mode === "reauth"
                  ? `请在授权窗口登录原账号「${authLock.accountName}」，完成后会自动保存。`
                  : `请在授权窗口登录「${authLock.platformName}」，完成后会自动保存。`
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
                        "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs",
                        status === "done" &&
                          "border-primary bg-primary text-primary-foreground",
                        status === "current" && "border-primary text-primary",
                        status === "pending" &&
                          "border-muted-foreground/30 text-muted-foreground",
                      )}
                    >
                      {status === "done" ? (
                        <Check className="size-3.5" />
                      ) : status === "current" ? (
                        <Spinner className="size-3.5" />
                      ) : (
                        <span className="size-1.5 rounded-full bg-current opacity-40" />
                      )}
                    </span>
                    <div className="min-w-0 pt-0.5">
                      <p
                        className={cn(
                          "text-sm font-medium",
                          status === "pending" && "text-muted-foreground",
                        )}
                      >
                        {step.label(authLock.platformName)}
                      </p>
                      {status === "current" && step.id === "login" ? (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {authLock.phase === "finishing"
                            ? "正在确认账号…"
                            : "在授权窗口完成登录"}
                        </p>
                      ) : null}
                      {status === "current" && step.id === "bind" ? (
                        <p className="mt-1 text-sm text-muted-foreground">
                          正在保存账号…
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : null}
          <DialogFooter className="sm:justify-center">
            <Button
              variant="outline"
              disabled={authLock?.phase === "binding"}
              onClick={handleCancelAuth}
            >
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
                <DialogTitle>设置账号名称</DialogTitle>
                <DialogDescription>
                  账号已添加，可设置一个便于识别的名称。
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center gap-3 rounded-xl bg-muted/50 px-3 py-3">
                <Avatar size="lg">
                  {authSuccess.account.avatarUrl ? (
                    <AvatarImage
                      src={authSuccess.account.avatarUrl}
                      alt={authSuccess.account.displayName}
                      referrerPolicy="no-referrer"
                    />
                  ) : null}
                  <AvatarFallback>
                    {authSuccess.account.displayName.slice(0, 1)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p
                    className="truncate font-medium"
                    title={authSuccess.account.displayName}
                  >
                    {authSuccess.account.displayName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {authSuccess.platformName}
                  </p>
                </div>
              </div>
              <DialogFooter>
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
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>移除媒体账号？</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `将从蒲公英移除「${deleteTarget.displayName}」，不会注销平台账号。再次使用时需重新添加。`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? <FieldError>{deleteError}</FieldError> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={() => {
                void handleDelete();
              }}
            >
              {busy ? <Spinner data-icon="inline-start" /> : null}
              移除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AgentNeededDialog
        open={agentNeededOpen}
        onOpenChange={setAgentNeededOpen}
      />
    </div>
  );
}

function AccountCard({
  account,
  health,
  platformName,
  busy,
  opening,
  highlighted,
  error,
  onOpenCreator,
  onReauth,
  onRename,
  onDelete,
}: {
  account: PlatformAccountItem;
  health?: AccountSessionHealth;
  platformName: string;
  busy: boolean;
  opening: boolean;
  highlighted: boolean;
  error?: string;
  onOpenCreator: () => void;
  onReauth: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const view = accountHealthView(account, health);
  const needsReauth = view === "invalid";

  return (
    <Card
      id={`account-${account.id}`}
      aria-label={`${platformName}账号：${account.displayName}`}
      data-highlighted={highlighted || undefined}
      className={cn(
        "h-full gap-4",
        highlighted &&
          "ring-2 ring-primary ring-offset-2 ring-offset-background",
      )}
    >
      <CardHeader>
        <div className="flex min-w-0 items-center gap-3">
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
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <CardTitle className="truncate" title={account.displayName}>
              {account.displayName}
            </CardTitle>
            <CardDescription className="flex items-center gap-1.5">
              <PlatformIcon
                platform={account.platform}
                alt=""
                aria-hidden="true"
                className="size-4 rounded-sm"
              />
              {platformName}
            </CardDescription>
          </div>
        </div>
        <CardAction>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={busy || opening}
                  aria-label={`管理账号：${account.displayName}`}
                />
              }
            >
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem disabled={busy || opening} onClick={onRename}>
                  <Pencil />
                  修改名称
                </DropdownMenuItem>
                <DropdownMenuItem disabled={busy || opening} onClick={onReauth}>
                  <Link2 />
                  重新授权
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  disabled={busy || opening}
                  onClick={onDelete}
                >
                  <Trash2 />
                  移除账号
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <AccountStatusBadge account={account} health={health} />
        </div>
        <AccountIdRow id={account.platformUserId} />
        {account.platformNickname &&
        account.platformNickname !== account.displayName ? (
          <p
            className="truncate text-xs text-muted-foreground"
            title={account.platformNickname}
          >
            平台昵称：{account.platformNickname}
          </p>
        ) : null}
        {error ? <FieldError>{error}</FieldError> : null}
      </CardContent>
      <CardFooter className="mt-auto">
        {/* 操作区固定一行高度，状态切换（创作者中心 / 重新登录 / 重新授权）时卡片高度不变 */}
        <div className="flex h-8 w-full items-center gap-2">
          {needsReauth ? (
            <Button
              size="sm"
              className="flex-1"
              disabled={busy || opening}
              onClick={onReauth}
            >
              <Link2 data-icon="inline-start" />
              重新授权
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                className="min-w-0 flex-1"
                disabled={busy || opening}
                onClick={onOpenCreator}
              >
                {opening ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <ExternalLink data-icon="inline-start" />
                )}
                {opening ? "打开中…" : "创作者中心"}
              </Button>
              {view === "expiring" ? (
                <Button
                  variant="secondary"
                  size="sm"
                  className="min-w-0 flex-1"
                  disabled={busy || opening}
                  onClick={onReauth}
                >
                  <Link2 data-icon="inline-start" />
                  重新登录
                </Button>
              ) : null}
            </>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}

/** 授权状态：正常只显示「已授权」，3 天内到期为橙色「即将过期」，确认失效为红色「已失效」 */
export function AccountStatusBadge({
  account,
  health,
}: {
  account: Pick<PlatformAccountItem, "status" | "lastAuthedAt">;
  health?: AccountSessionHealth;
}) {
  const view = accountHealthView(account, health);
  if (view === "invalid") {
    return <Badge variant="destructive">已失效</Badge>;
  }
  if (view === "expiring") {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Badge className="bg-orange-500/15 text-orange-700 dark:bg-orange-400/20 dark:text-orange-300" />
          }
        >
          即将过期
        </TooltipTrigger>
        <TooltipContent>
          {health?.expiresAt
            ? `约 ${formatTimeUntil(health.expiresAt)}需要重新登录`
            : "即将需要重新登录"}
        </TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger render={<Badge variant="secondary" />}>
        已授权
      </TooltipTrigger>
      <TooltipContent>
        最近授权 {formatRelativeTime(account.lastAuthedAt)}（
        {formatAbsoluteTime(account.lastAuthedAt)}）
      </TooltipContent>
    </Tooltip>
  );
}

/** 账号 ID：过长截断，悬停看完整 ID，旁边可一键复制 */
export function AccountIdRow({ id }: { id: string | null }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  if (!id) {
    return <p className="text-xs text-muted-foreground">账号 ID 暂未获取</p>;
  }
  return (
    <div className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
      <span className="shrink-0">账号 ID：</span>
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="min-w-0 truncate tabular-nums" tabIndex={0} />
          }
        >
          {id}
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-80 break-all">
          {id}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="shrink-0"
              aria-label={copied ? "已复制账号 ID" : "复制账号 ID"}
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(id)
                  .then(() => setCopied(true))
                  .catch(() => {
                    toast.add({ type: "error", title: "复制失败，请手动选择" });
                  });
              }}
            />
          }
        >
          {copied ? <Check /> : <Copy />}
        </TooltipTrigger>
        <TooltipContent>{copied ? "已复制" : "复制"}</TooltipContent>
      </Tooltip>
    </div>
  );
}
