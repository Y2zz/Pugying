import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  Clapperboard,
  FileText,
  ImageIcon,
  MoreHorizontal,
  Pencil,
  ExternalLink,
  RefreshCw,
  RotateCcw,
  SearchIcon,
  Send,
  Trash2,
  XIcon,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PLATFORM_ACCOUNT_SYNCED_EVENT } from "@/hooks/use-creator-window-sync";
import {
  CONTENT_STATUS_OPTIONS,
  EMPTY_CONTENT_COUNTS,
  PLATFORM_NAMES,
  summarizeContent,
  contentTargetMessage,
  safePlatformUrl,
} from "@/lib/content-management";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layouts/PageHeader";
import { StickyPageHeader } from "@/components/layouts/StickyPageHeader";
import { PlatformIcon } from "@/components/PlatformIcon";
import { MediaPreviewImage } from "@/components/MediaPreviewImage";
import { useUiDensity } from "@/hooks/use-ui-density";
import { submitDistribution } from "@/lib/distribution";
import { ARTICLE_SUPPORTED_PLATFORMS } from "@/lib/platforms";
import {
  deleteContent,
  fetchContents,
  fetchContent,
  fetchPlatformAccounts,
  type PlatformAccountItem,
  type ContentManagementStatus,
  type ContentStatusCounts,
  type ContentItem,
  type ContentTargetItem,
  type ContentType,
  type TargetPublishStatus,
} from "@/lib/api";
import type { UiDensity } from "@/lib/ui-density";
import { cn } from "@/lib/utils";

type TypeFilter = "all" | ContentType;

const TYPE_META: Record<ContentType, { label: string; icon: typeof FileText }> =
  {
    article: { label: "文章", icon: FileText },
    graphic: { label: "图文", icon: ImageIcon },
    video: { label: "视频", icon: Clapperboard },
  };

const TYPE_FILTER_OPTIONS: Array<{ value: TypeFilter; label: string }> = [
  { value: "all", label: "全部类型" },
  { value: "article", label: "文章" },
  { value: "graphic", label: "图文" },
  { value: "video", label: "视频" },
];

const CONTENT_PAGE_SIZE = 20;

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
    const pageNum = sorted[i]!;
    if (i > 0 && pageNum - sorted[i - 1]! > 1) {
      result.push("gap");
    }
    result.push(pageNum);
  }
  return result;
}

const TARGET_STATUS_LABEL: Record<TargetPublishStatus, string> = {
  idle: "未发布",
  queued: "排队中",
  running: "发布中",
  succeeded: "成功",
  failed: "失败",
  cancelled: "已取消",
};

function formatTime(value: string | null): string {
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

/** 定时文案用短格式，避免卡片被完整时间戳撑开 */
function formatScheduleTime(value: string): string {
  try {
    return new Date(value).toLocaleString("zh-CN", {
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

function editPath(item: ContentItem): string {
  if (item.type === "article") {
    return `/publish/article?id=${item.id}`;
  }
  if (item.type === "graphic") {
    return `/publish/graphic?id=${item.id}`;
  }
  return `/publish/video?id=${item.id}`;
}

export default function Contents() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<TypeFilter>("all");
  const [query, setQuery] = useState("");
  const { density, compact } = useUiDensity();
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContentItem | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [detailsItem, setDetailsItem] = useState<ContentItem | null>(null);
  const [detailsError, setDetailsError] = useState("");
  const [accounts, setAccounts] = useState<PlatformAccountItem[] | null>(null);
  const [accountError, setAccountError] = useState(false);
  const [managementStatus, setManagementStatus] = useState<
    ContentManagementStatus | "all"
  >("all");
  const [counts, setCounts] =
    useState<ContentStatusCounts>(EMPTY_CONTENT_COUNTS);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [error, setError] = useState("");
  const loadSeqRef = useRef(0);
  const fetchingRef = useRef(false);
  const totalPages = Math.max(1, Math.ceil(total / CONTENT_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const reload = useCallback(
    async (silent = false) => {
      const seq = ++loadSeqRef.current;
      fetchingRef.current = true;
      if (!silent) {
        setLoading(true);
      }
      const [listResult, detailResult] = await Promise.allSettled([
        fetchContents({
          type: filter === "all" ? undefined : filter,
          q: debouncedQuery.trim() || undefined,
          managementStatus:
            managementStatus === "all" ? undefined : managementStatus,
          page,
          pageSize: CONTENT_PAGE_SIZE,
        }),
        detailsId ? fetchContent(detailsId) : Promise.resolve(null),
      ]);
      if (seq !== loadSeqRef.current) {
        return;
      }
      if (listResult.status === "fulfilled") {
        const result = listResult.value;
        setItems(result.items);
        setTotal(result.total);
        setCounts(result.counts);
        setPage(
          Math.min(
            page,
            Math.max(1, Math.ceil(result.total / CONTENT_PAGE_SIZE)),
          ),
        );
        setError("");
      } else {
        setError("作品加载失败，请重试");
      }
      if (detailResult.status === "fulfilled") {
        setDetailsItem(detailResult.value);
        setDetailsError("");
      } else {
        setDetailsError("分发详情更新失败，请重试");
      }
      fetchingRef.current = false;
      setLoading(false);
    },
    [filter, debouncedQuery, managementStatus, page, detailsId],
  );
  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
    void reload();
    return () => {
      loadSeqRef.current++;
    };
  }, [reload]);

  useEffect(() => {
    if (query === debouncedQuery) {
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
      setPage(1);
    }, 300);
    return () => {
      clearTimeout(timer);
    };
  }, [query, debouncedQuery]);

  useEffect(() => {
    let active = true;
    let accountSeq = 0;
    const loadAccounts = async () => {
      const seq = ++accountSeq;
      try {
        const result = await fetchPlatformAccounts();
        if (active && seq === accountSeq) {
          setAccounts(result);
          setAccountError(false);
        }
      } catch {
        if (active && seq === accountSeq) {
          setAccountError(true);
        }
      }
    };
    void loadAccounts();
    window.addEventListener(PLATFORM_ACCOUNT_SYNCED_EVENT, loadAccounts);
    window.addEventListener("focus", loadAccounts);
    return () => {
      active = false;
      window.removeEventListener(PLATFORM_ACCOUNT_SYNCED_EVENT, loadAccounts);
      window.removeEventListener("focus", loadAccounts);
    };
  }, []);

  useEffect(() => {
    const refresh = () => {
      if (!document.hidden && !fetchingRef.current) {
        void reloadRef.current(true);
      }
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = setInterval(
      refresh,
      counts.publishing > 0 || busyId ? 3000 : 15000,
    );
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [counts.publishing, busyId]);

  const goToPage = (nextPage: number) => {
    setPage(nextPage);
  };
  const hasSearchFilters =
    Boolean(query.trim()) || filter !== "all" || managementStatus !== "all";
  const resetSearchFilters = () => {
    setQuery("");
    setDebouncedQuery("");
    setFilter("all");
    setManagementStatus("all");
    setPage(1);
  };

  const handleRetryTarget = async (
    item: ContentItem,
    target: ContentTargetItem,
  ) => {
    if (
      busyId ||
      item.targets.some(
        (value) =>
          value.publishStatus === "queued" || value.publishStatus === "running",
      )
    ) {
      return;
    }
    setBusyId(`${item.id}:${target.id}`);
    setError("");
    try {
      await submitDistribution(item.id, target.id);
      await reloadRef.current(true);
    } catch {
      await reloadRef.current(true);
      setError("重新发布失败，请稍后重试");
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmDelete = async (item: ContentItem) => {
    setBusyId(item.id);
    setError("");
    try {
      await deleteContent(item.id);
      setDeleteTarget(null);
      await reloadRef.current(true);
    } catch {
      setError("删除失败，请重试");
    } finally {
      setBusyId(null);
    }
  };

  const handleDistribute = async (item: ContentItem) => {
    if (busyId) {
      return;
    }
    setBusyId(item.id);
    setError("");
    try {
      await submitDistribution(item.id);
      await reloadRef.current(true);
    } catch {
      setError("未能加入分发队列，请检查作品和账号后重试");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col" aria-busy={loading}>
      <StickyPageHeader className="gap-4 pb-2 md:pb-2">
        <PageHeader title="作品管理" description="管理作品与分发进度" />

        <div className="overflow-x-auto">
          <ToggleGroup
            aria-label="作品状态"
            value={[managementStatus]}
            onValueChange={(values) => {
              const next = values[0] as
                ContentManagementStatus | "all" | undefined;
              if (next) {
                setManagementStatus(next);
                setPage(1);
              }
            }}
          >
            {CONTENT_STATUS_OPTIONS.map((option) => (
              <ToggleGroupItem key={option.value} value={option.value}>
                {option.label}
                <span className="tabular-nums">{counts[option.value]}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <InputGroup className="min-w-0 max-w-xs flex-1">
              <InputGroupInput
                id="content-search"
                value={query}
                placeholder="搜索标题、正文或标签"
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
                      setQuery("");
                    }}
                  >
                    <XIcon />
                  </InputGroupButton>
                </InputGroupAddon>
              ) : null}
            </InputGroup>
            <Select
              value={filter}
              onValueChange={(value) => {
                const next = (value as TypeFilter) ?? "all";
                setFilter(next);
                setPage(1);
              }}
              items={TYPE_FILTER_OPTIONS}
            >
              <SelectTrigger className="w-36 shrink-0" aria-label="作品类型">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {TYPE_FILTER_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {hasSearchFilters ? (
              <Button
                type="button"
                variant="ghost"
                className="shrink-0"
                onClick={resetSearchFilters}
              >
                <RotateCcw data-icon="inline-start" />
                重置
              </Button>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center justify-center gap-2">
            <Button
              variant="outline"
              disabled={loading}
              onClick={() => {
                void reload();
                window.dispatchEvent(new Event(PLATFORM_ACCOUNT_SYNCED_EVENT));
              }}
            >
              <RefreshCw data-icon="inline-start" />
              刷新
            </Button>
          </div>
        </div>
      </StickyPageHeader>

      {error ? (
        <Alert variant="destructive" className="mt-6">
          <AlertCircle />
          <AlertTitle>暂时未能完成</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {loading && items.length === 0 ? (
        <div className="divide-y">
          {Array.from({ length: compact ? 8 : 6 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-4",
                compact
                  ? "py-4 first:pt-2 last:pb-2"
                  : "py-6 first:pt-4 last:pb-4",
              )}
            >
              <div
                className={cn(
                  "flex min-w-0 flex-1 gap-3",
                  compact ? "items-stretch" : "items-start",
                )}
              >
                <Skeleton
                  className={cn(
                    "shrink-0 rounded-md",
                    compact
                      ? "aspect-[4/3] min-h-12 w-auto"
                      : "w-24 aspect-[4/3]",
                  )}
                />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-48 max-w-full" />
                  <Skeleton className="h-4 w-64 max-w-full" />
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end justify-between self-stretch">
                <Skeleton className="h-8 w-36" />
                <Skeleton className="h-4 w-28" />
              </div>
            </div>
          ))}
        </div>
      ) : !error && total === 0 && !hasSearchFilters ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ImageIcon />
            </EmptyMedia>
            {/* !hasSearchFilters 时 filter 必为 all，此处不必再按类型分支 */}
            <EmptyTitle>暂无作品</EmptyTitle>
            <EmptyDescription>
              使用左侧菜单上方的「发布」按钮创建第一条作品。
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : !error && total === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchIcon />
            </EmptyMedia>
            <EmptyTitle>未找到匹配作品</EmptyTitle>
            <EmptyDescription>
              调整筛选条件，或重置后查看全部作品。
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="divide-y">
            {items.map((item) => (
              <ContentListItem
                key={item.id}
                item={item}
                density={density}
                busy={
                  busyId === item.id ||
                  busyId?.startsWith(`${item.id}:`) === true
                }
                onShowDetails={() => {
                  setDetailsId(item.id);
                  setDetailsItem(item);
                }}
                onDelete={() => {
                  setDeleteTarget(item);
                }}
                onDistribute={() => {
                  void handleDistribute(item);
                }}
              />
            ))}
          </div>
          <p
            role="status"
            aria-label="分页信息"
            className="text-sm text-muted-foreground"
          >
            共 {total} 条作品
            {totalPages > 1 ? ` · 第 ${currentPage} / ${totalPages} 页` : null}
          </p>
          {totalPages > 1 ? (
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    text="上一页"
                    aria-label="上一页"
                    aria-disabled={currentPage <= 1 || undefined}
                    className={
                      currentPage <= 1
                        ? "pointer-events-none opacity-50"
                        : undefined
                    }
                    onClick={(e) => {
                      e.preventDefault();
                      if (currentPage > 1) {
                        goToPage(currentPage - 1);
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
                        onClick={(e) => {
                          e.preventDefault();
                          if (item !== currentPage) {
                            goToPage(item);
                          }
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
                    className={
                      currentPage >= totalPages
                        ? "pointer-events-none opacity-50"
                        : undefined
                    }
                    onClick={(e) => {
                      e.preventDefault();
                      if (currentPage < totalPages) {
                        goToPage(currentPage + 1);
                      }
                    }}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          ) : null}
        </div>
      )}

      <ContentTargetDetailsSheet
        item={detailsItem}
        accounts={accounts}
        onRefresh={() => {
          void reloadRef.current(true);
          window.dispatchEvent(new Event(PLATFORM_ACCOUNT_SYNCED_EVENT));
        }}
        error={detailsError}
        accountError={accountError}
        onOpenChange={(open) => {
          if (!open) {
            setDetailsId(null);
            setDetailsItem(null);
          }
        }}
        busy={busyId !== null}
        onRetryTarget={(target) => {
          if (detailsItem) {
            void handleRetryTarget(detailsItem, target);
          }
        }}
      />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && busyId === null) {
            setDeleteTarget(null);
            // 关闭后不把焦点还回触发卡片，避免残留 focus ring
            queueMicrotask(() => {
              if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
              }
            });
          }
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>删除作品？</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `将删除「${deleteTarget.title}」。关联的分发记录将一并移除。平台上的作品和原始文件会保留，此操作不可恢复。`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyId !== null}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busyId !== null}
              onClick={() => {
                if (deleteTarget) {
                  void handleConfirmDelete(deleteTarget);
                }
              }}
            >
              {busyId !== null ? "删除中…" : "删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ContentListItem({
  item,
  density,
  busy,
  onShowDetails,
  onDelete,
  onDistribute,
}: {
  item: ContentItem;
  density: UiDensity;
  busy: boolean;
  onShowDetails: () => void;
  onDelete: () => void;
  onDistribute: () => void;
}) {
  const meta = TYPE_META[item.type];
  const TypeIcon = meta.icon;
  const compact = density === "compact";
  const dist = summarizeContent(item);
  const editTo = editPath(item);
  const active = busy || dist.running > 0;
  const finishedAt = item.targets
    .map((target) => target.finishedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  const time =
    dist.status === "completed"
      ? (finishedAt ?? item.updatedAt)
      : item.updatedAt;
  const timeFull = `${dist.status === "completed" ? "完成于" : "更新于"} ${formatTime(time)}`;
  const timeLabel = formatScheduleTime(time);
  // 紧凑模式靠 items-stretch 对齐行高；勿用 h-full（父级无固定高度会塌成 0）
  const thumbClass = compact
    ? "aspect-[4/3] min-h-12 w-auto shrink-0"
    : "w-24 aspect-[4/3]";

  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-4",
        compact ? "py-4 first:pt-2 last:pb-2" : "py-6 first:pt-4 last:pb-4",
      )}
    >
      <div
        className={cn(
          "flex min-w-0 flex-1 gap-3",
          compact ? "items-stretch" : "items-start",
        )}
      >
        <Link
          to={active ? "#" : editTo}
          onClick={(event) => {
            if (active) {
              event.preventDefault();
              onShowDetails();
            }
          }}
          className={cn(
            "relative block shrink-0 overflow-hidden rounded-md bg-muted",
            thumbClass,
          )}
          aria-label={`${active ? "查看进度" : "编辑"} ${item.title}`}
        >
          {item.hasCover ? (
            <MediaPreviewImage
              contentId={item.id}
              kind="portrait"
              alt=""
              className="absolute inset-0 size-full rounded-md border-0"
              objectFit="cover"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-muted-foreground">
              <TypeIcon className={compact ? "size-4" : "size-5"} />
            </div>
          )}
        </Link>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Link
            to={active ? "#" : editTo}
            onClick={(event) => {
              if (active) {
                event.preventDefault();
                onShowDetails();
              }
            }}
            className={cn(
              "inline-block max-w-full truncate font-heading text-base font-medium hover:underline",
              compact ? "leading-normal" : "leading-7",
            )}
            title={item.title}
          >
            {item.title}
          </Link>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <Badge
              variant="secondary"
              className="h-auto gap-1 text-xs font-normal [&>svg]:size-3!"
            >
              <TypeIcon />
              {meta.label}
            </Badge>
            <Badge variant={dist.tone} className="h-auto text-xs">
              {dist.label}
            </Badge>
            {dist.total > 0 ? <span>{dist.line}</span> : <span>暂无分发</span>}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end justify-between self-stretch">
        <div className="flex flex-wrap items-center justify-end gap-1">
          {dist.total > 0 ? (
            <Button
              size="sm"
              variant={dist.status === "needs_attention" ? "outline" : "ghost"}
              onClick={onShowDetails}
            >
              {dist.status === "needs_attention"
                ? "处理问题"
                : dist.status === "publishing"
                  ? "查看进度"
                  : "分发详情"}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            disabled={active}
            nativeButton={false}
            render={<Link to={editTo} />}
          >
            <Pencil data-icon="inline-start" />
            {dist.status === "draft" ? "继续编辑" : "编辑"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button size="sm" variant="ghost" disabled={active} />}
              aria-label={`更多操作：${item.title}`}
            >
              <MoreHorizontal data-icon="inline-start" />
              更多
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                {item.targets.some(
                  (target) =>
                    (item.type === "article"
                      ? (
                          ARTICLE_SUPPORTED_PLATFORMS as readonly string[]
                        ).includes(target.platform)
                      : target.platform === "douyin") &&
                    ["idle", "failed", "cancelled"].includes(
                      target.publishStatus,
                    ),
                ) ? (
                  <DropdownMenuItem disabled={active} onClick={onDistribute}>
                    <Send />
                    开始分发
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem
                  variant="destructive"
                  disabled={active}
                  onClick={onDelete}
                >
                  <Trash2 />
                  删除
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <span
          className="text-right text-sm text-muted-foreground"
          title={timeFull}
        >
          {compact ? timeLabel : timeFull}
        </span>
      </div>
    </div>
  );
}

function ContentTargetDetailsSheet({
  item,
  accounts,
  onRefresh,
  error,
  accountError,
  onOpenChange,
  busy,
  onRetryTarget,
}: {
  item: ContentItem | null;
  accounts: PlatformAccountItem[] | null;
  onRefresh: () => void;
  error: string;
  accountError: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onRetryTarget: (target: ContentTargetItem) => void;
}) {
  const open = item !== null;
  if (!item) {
    return null;
  }

  const meta = TYPE_META[item.type];
  const dist = summarizeContent(item);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 sm:max-w-md"
      >
        <SheetHeader>
          <SheetTitle className="pr-8">{item.title}</SheetTitle>
          <SheetDescription>
            {meta.label}
            {" · "}
            {dist.label}
            {" · "}
            {dist.line}
          </SheetDescription>
          <Button
            size="sm"
            variant="outline"
            className="self-start"
            onClick={onRefresh}
          >
            <RefreshCw data-icon="inline-start" />
            刷新详情
          </Button>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
          {dist.succeeded > 0 ? (
            <p className="text-sm text-muted-foreground">
              发布完成不代表审核通过，请到平台查看。
            </p>
          ) : null}
          {error || accountError ? (
            <Alert>
              <AlertDescription>
                {error || "账号信息暂时无法加载，请刷新后重试"}
              </AlertDescription>
            </Alert>
          ) : null}
          {item.targets.length === 0 ? (
            <p className="text-muted-foreground">尚未配置分发账号。</p>
          ) : (
            item.targets.map((target) => {
              const failed =
                target.publishStatus === "failed" ||
                target.publishStatus === "cancelled";
              const authExpired = target.errorCode === "AUTH_EXPIRED";
              const account = accounts?.find(
                (value) => value.id === target.platformAccountId,
              );
              const platformUrl = safePlatformUrl(target.platformUrl);
              const mediaMissing =
                target.errorCode === "MEDIA_MISSING" ||
                target.errorCode === "MEDIA_UNREACHABLE";
              return (
                <div
                  key={target.id}
                  className="flex flex-col gap-2 rounded-lg border p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        <PlatformIcon
                          platform={target.platform}
                          className="size-4 shrink-0"
                        />
                        <span className="truncate">
                          {PLATFORM_NAMES[target.platform]} ·{" "}
                          {account?.displayName ||
                            (accountError
                              ? "账号信息暂不可用"
                              : accounts
                                ? "账号已移除"
                                : "正在读取账号")}{" "}
                        </span>
                      </p>
                      {target.finishedAt || target.startedAt ? (
                        <p className="text-xs text-muted-foreground">
                          {target.finishedAt
                            ? `完成于 ${formatTime(target.finishedAt)}`
                            : `开始于 ${formatTime(target.startedAt)}`}
                        </p>
                      ) : null}
                    </div>
                    <Badge
                      variant={
                        target.publishStatus === "succeeded"
                          ? "default"
                          : failed
                            ? "destructive"
                            : target.publishStatus === "queued" ||
                                target.publishStatus === "running"
                              ? "secondary"
                              : "outline"
                      }
                    >
                      {TARGET_STATUS_LABEL[target.publishStatus]}
                    </Badge>
                  </div>
                  {failed ? (
                    <p className="text-sm text-destructive">
                      {contentTargetMessage(target)}
                    </p>
                  ) : null}
                  {failed ? (
                    <div className="flex flex-wrap gap-2">
                      {authExpired ? (
                        <Button
                          size="sm"
                          variant="outline"
                          nativeButton={false}
                          render={<Link to={"/platform-accounts"} />}
                        >
                          去重新授权
                        </Button>
                      ) : mediaMissing ? (
                        <Button
                          size="sm"
                          variant="outline"
                          nativeButton={false}
                          render={<Link to={editPath(item)} />}
                        >
                          重新选择素材
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          disabled={busy || dist.running > 0 || !account}
                          onClick={() => {
                            onRetryTarget(target);
                          }}
                        >
                          <RotateCcw data-icon="inline-start" />
                          {target.publishStatus === "cancelled"
                            ? "重新发布"
                            : "重试"}
                        </Button>
                      )}
                    </div>
                  ) : null}
                  {target.overrides.scheduledAt || item.scheduledAt ? (
                    <p className="text-sm text-muted-foreground">
                      计划发布于{" "}
                      {formatTime(
                        target.overrides.scheduledAt || item.scheduledAt,
                      )}
                    </p>
                  ) : null}
                  {target.publishStatus === "succeeded" && platformUrl ? (
                    <Button
                      size="sm"
                      variant="outline"
                      nativeButton={false}
                      render={
                        <a
                          href={platformUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        />
                      }
                    >
                      <ExternalLink data-icon="inline-start" />
                      查看平台作品
                    </Button>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
