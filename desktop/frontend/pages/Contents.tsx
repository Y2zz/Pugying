import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  Clapperboard,
  FileText,
  ImageIcon,
  Pencil,
  RefreshCw,
  RotateCcw,
  SearchIcon,
  Trash2,
  XIcon,
} from 'lucide-react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
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
import { PageHeader } from '@/components/layouts/PageHeader';
import { StickyPageHeader } from '@/components/layouts/StickyPageHeader';
import { MediaPreviewImage } from '@/components/MediaPreviewImage';
import { useUiDensity } from '@/hooks/use-ui-density';
import { agentClient } from '@/lib/agent-client';
import {
  completeContentTarget,
  deleteContent,
  fetchContents,
  retryContentTarget,
  startContentTarget,
  type ContentItem,
  type ContentTargetItem,
  type ContentType,
  type TargetPublishStatus,
} from '@/lib/api';
import { describeCaughtError, describePublishError } from '@/lib/publish-errors';
import type { UiDensity } from '@/lib/ui-density';
import { cn } from '@/lib/utils';

type TypeFilter = 'all' | ContentType;

const TYPE_META: Record<ContentType, { label: string; icon: typeof FileText }> =
  {
    article: { label: '图文', icon: FileText },
    video: { label: '视频', icon: Clapperboard },
  };

const TYPE_FILTER_OPTIONS: Array<{ value: TypeFilter; label: string }> = [
  { value: 'all', label: '全部类型' },
  { value: 'article', label: '图文' },
  { value: 'video', label: '视频' },
];

const CONTENT_PAGE_SIZE = 20;

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
    const pageNum = sorted[i]!;
    if (i > 0 && pageNum - sorted[i - 1]! > 1) {
      result.push('gap');
    }
    result.push(pageNum);
  }
  return result;
}

const TARGET_STATUS_LABEL: Record<TargetPublishStatus, string> = {
  idle: '未发布',
  queued: '排队中',
  running: '发布中',
  succeeded: '成功',
  failed: '失败',
  cancelled: '已取消',
};

function formatTime(value: string | null): string {
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

/** 定时文案用短格式，避免卡片被完整时间戳撑开 */
function formatScheduleTime(value: string): string {
  try {
    return new Date(value).toLocaleString('zh-CN', {
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

function editPath(item: ContentItem): string {
  return item.type === 'article'
    ? `/publish/article?id=${item.id}`
    : `/publish/video?id=${item.id}`;
}

function summarizeTargets(targets: ContentTargetItem[]): {
  label: string;
  tone: 'default' | 'secondary' | 'outline' | 'destructive';
  succeeded: number;
  failed: number;
  running: number;
  total: number;
  /** 卡片摘要一行，例如「分发 3 · 2 成功 1 失败」 */
  line: string;
} {
  const total = targets.length;
  if (total === 0) {
    return {
      label: '无分发',
      tone: 'outline',
      succeeded: 0,
      failed: 0,
      running: 0,
      total: 0,
      line: '暂无分发',
    };
  }
  const succeeded = targets.filter((t) => t.publishStatus === 'succeeded').length;
  const failed = targets.filter(
    (t) => t.publishStatus === 'failed' || t.publishStatus === 'cancelled',
  ).length;
  const running = targets.filter(
    (t) => t.publishStatus === 'queued' || t.publishStatus === 'running',
  ).length;

  let label = '未推送';
  let tone: 'default' | 'secondary' | 'outline' | 'destructive' = 'outline';
  if (running > 0) {
    label = '发布中';
    tone = 'secondary';
  } else if (succeeded > 0 && failed > 0) {
    label = '部分成功';
    tone = 'default';
  } else if (succeeded === total) {
    label = '全部成功';
    tone = 'default';
  } else if (failed > 0 && succeeded === 0) {
    label = '发布失败';
    tone = 'destructive';
  }

  const parts = [`分发 ${total}`];
  if (succeeded > 0) {
    parts.push(`${succeeded} 成功`);
  }
  if (failed > 0) {
    parts.push(`${failed} 失败`);
  }
  if (running > 0) {
    parts.push(`${running} 进行中`);
  }
  if (succeeded === 0 && failed === 0 && running === 0) {
    parts.push('未推送');
  }

  return {
    label,
    tone,
    succeeded,
    failed,
    running,
    total,
    line: parts.join(' · '),
  };
}

/**
 * 卡片一眼状态：优先分发运行态；无结果时再落定时 / 草稿。
 * 「已发布」不作为封面主状态，避免与分发成功混淆。
 */
function glanceStatus(item: ContentItem): {
  label: string;
  tone: 'default' | 'secondary' | 'outline' | 'destructive';
  scheduled: boolean;
} {
  const dist = summarizeTargets(item.targets);
  if (dist.total > 0 && (dist.running > 0 || dist.succeeded > 0 || dist.failed > 0)) {
    return { label: dist.label, tone: dist.tone, scheduled: false };
  }
  if (item.scheduledAt && new Date(item.scheduledAt).getTime() > Date.now()) {
    return {
      label: `定时 ${formatScheduleTime(item.scheduledAt)}`,
      tone: 'outline',
      scheduled: true,
    };
  }
  if (item.status === 'draft') {
    return { label: '草稿', tone: 'outline', scheduled: false };
  }
  if (dist.total === 0) {
    return { label: '未推送', tone: 'outline', scheduled: false };
  }
  return { label: dist.label, tone: dist.tone, scheduled: false };
}

export default function Contents() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<TypeFilter>('all');
  const [query, setQuery] = useState('');
  const { density, compact } = useUiDensity();
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContentItem | null>(null);
  const [detailsItem, setDetailsItem] = useState<ContentItem | null>(null);
  const [error, setError] = useState('');
  const loadSeqRef = useRef(0);

  const totalPages = Math.max(1, Math.ceil(total / CONTENT_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  // 服务端筛选 + 分页；显式传入 next，避免 setState 异步读到旧值
  const reload = async (
    nextFilter: TypeFilter = filter,
    nextQuery: string = query,
    nextPage: number = page,
  ) => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    setError('');
    try {
      const result = await fetchContents({
        type: nextFilter === 'all' ? undefined : nextFilter,
        q: nextQuery.trim() || undefined,
        page: nextPage,
        pageSize: CONTENT_PAGE_SIZE,
      });
      if (seq !== loadSeqRef.current) {
        return;
      }
      const resolvedTotalPages = Math.max(
        1,
        Math.ceil(result.total / CONTENT_PAGE_SIZE),
      );
      const resolvedPage = Math.min(nextPage, resolvedTotalPages);
      if (resolvedPage !== nextPage && result.total > 0) {
        return reload(nextFilter, nextQuery, resolvedPage);
      }
      setPage(resolvedPage);
      setItems(result.items);
      setTotal(result.total);
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

  const goToPage = (nextPage: number) => {
    setPage(nextPage);
    void reload(filter, query, nextPage);
  };

  useEffect(() => {
    const initial = setTimeout(() => {
      void reload();
    }, 0);
    return () => {
      clearTimeout(initial);
    };
    // 仅首屏拉一次；后续由类型切换 / 关键词防抖触发
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only
  }, []);

  // 关键词防抖后打服务端；跳过首屏避免与挂载请求重复
  const queryBootRef = useRef(true);
  useEffect(() => {
    if (queryBootRef.current) {
      queryBootRef.current = false;
      return;
    }
    const timer = setTimeout(() => {
      setPage(1);
      void reload(filter, query, 1);
    }, 300);
    return () => {
      clearTimeout(timer);
    };
    // filter 变化走 Select 即时 reload；此处只跟 query
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce query only
  }, [query]);

  // 关键词或类型任一偏离默认时，允许一键重置
  const hasSearchFilters = Boolean(query.trim()) || filter !== 'all';

  const resetSearchFilters = () => {
    setQuery('');
    setFilter('all');
    setPage(1);
    void reload('all', '', 1);
  };

  const handleRetryTarget = async (
    item: ContentItem,
    target: ContentTargetItem,
  ) => {
    setBusyId(`${item.id}:${target.id}`);
    setError('');
    try {
      agentClient.connect();
      if (agentClient.getStatus() !== 'connected') {
        throw new Error('应用未就绪，请重启「蒲公英」后再试');
      }
      const { dispatch } = await retryContentTarget(item.id, target.id);
      const { dispatch: started } = await startContentTarget(
        item.id,
        target.id,
      );
      const payload = started ?? dispatch;
      const result = await agentClient.startPublish({
        targetId: payload.targetId,
        platform: payload.platform,
        accountId: payload.accountId,
        contentType: payload.contentType ?? 'video',
        mediaPath: payload.mediaPath,
        mediaPaths: payload.mediaPaths,
        coverPath: payload.coverPath,
        coverLandscapePath: payload.coverLandscapePath,
        title: payload.title,
        body: payload.body,
        visibility: payload.visibility,
        scheduledAt: payload.scheduledAt,
        allowDownload: payload.allowDownload,
        cookies: payload.cookies,
      });
      await completeContentTarget(item.id, target.id, {
        ok: result.ok,
        errorCode: result.errorCode ?? result.error,
        errorMessage: result.error,
        platformPostId: result.platformPostId,
        platformUrl: result.platformUrl,
      });
      await reload();
      if (!result.ok) {
        setError(
          describePublishError(result.errorCode ?? result.error, result.error),
        );
      }
    } catch (err) {
      setError(describeCaughtError(err, '重试失败'));
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmDelete = async (item: ContentItem) => {
    setBusyId(item.id);
    setError('');
    try {
      await deleteContent(item.id);
      setDeleteTarget(null);
      await reload(filter, query, page);
    } catch (err) {
      setDeleteTarget(null);
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col">
      <StickyPageHeader showDivider>
        <PageHeader
          title="作品管理"
          description="回看与重试分发结果；新建请走左侧「发布 → 发布视频」"
        />

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
                        setQuery('');
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
                  const next = (value as TypeFilter) ?? 'all';
                  setFilter(next);
                  setPage(1);
                  void reload(next, query, 1);
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
                <Button type="button" variant="ghost" className="shrink-0" onClick={resetSearchFilters}>
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
          <AlertTitle>加载失败</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <div className="divide-y">
          {Array.from({ length: compact ? 8 : 6 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                'flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-4',
                compact ? 'py-4' : 'py-6',
              )}
            >
              <div
                className={cn(
                  'flex min-w-0 flex-1 gap-3',
                  compact ? 'items-stretch' : 'items-start',
                )}
              >
                <Skeleton
                  className={cn(
                    'shrink-0 rounded-md',
                    compact
                      ? 'aspect-[4/3] min-h-12 w-auto'
                      : 'w-24 aspect-[4/3]',
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
      ) : total === 0 && !hasSearchFilters ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ImageIcon />
            </EmptyMedia>
            {/* !hasSearchFilters 时 filter 必为 all，此处不必再按类型分支 */}
            <EmptyTitle>暂无作品</EmptyTitle>
            <EmptyDescription>
              使用左侧菜单上方的「发布」按钮创建第一条图文或视频作品。
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : total === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchIcon />
            </EmptyMedia>
            <EmptyTitle>未找到匹配作品</EmptyTitle>
            <EmptyDescription>换个关键词试试，或点「重置」清空搜索条件查看全部作品。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="divide-y">
            {items.map((item) => (
              <ContentListItem
                key={item.id}
                item={item}
                density={density}
                busy={busyId === item.id || busyId?.startsWith(`${item.id}:`) === true}
                onShowDetails={() => {
                  setDetailsItem(item);
                }}
                onRetryTarget={(target) => {
                  void handleRetryTarget(item, target);
                }}
                onDelete={() => {
                  setDeleteTarget(item);
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
                        goToPage(currentPage - 1);
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
                      currentPage >= totalPages ? 'pointer-events-none opacity-50' : undefined
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
        onOpenChange={(open) => {
          if (!open) {
            setDetailsItem(null);
          }
        }}
        busy={
          detailsItem !== null &&
          (busyId === detailsItem.id || busyId?.startsWith(`${detailsItem.id}:`) === true)
        }
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
                ? `将删除「${deleteTarget.title}」。关联的分发记录将一并移除，此操作不可恢复。`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyId !== null}>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busyId !== null}
              onClick={() => {
                if (deleteTarget) {
                  void handleConfirmDelete(deleteTarget);
                }
              }}
            >
              {busyId !== null ? '删除中…' : '删除'}
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
  onRetryTarget,
  onDelete,
}: {
  item: ContentItem;
  density: UiDensity;
  busy: boolean;
  onShowDetails: () => void;
  onRetryTarget: (target: ContentTargetItem) => void;
  onDelete: () => void;
}) {
  const meta = TYPE_META[item.type];
  const TypeIcon = meta.icon;
  const published = item.status === 'published';
  const compact = density === 'compact';
  const dist = summarizeTargets(item.targets);
  const glance = glanceStatus(item);
  const failedTargets = item.targets.filter(
    (t) => t.publishStatus === 'failed' || t.publishStatus === 'cancelled',
  );
  const authExpiredTargets = failedTargets.filter((t) => t.errorCode === 'AUTH_EXPIRED');
  const retryableTargets = failedTargets.filter((t) => t.errorCode !== 'AUTH_EXPIRED');
  const editTo = editPath(item);
  const timeLabel = published
    ? item.publishedAt
      ? formatScheduleTime(item.publishedAt)
      : '—'
    : formatScheduleTime(item.updatedAt);
  const timeFull = published
    ? `发布于 ${formatTime(item.publishedAt)}`
    : `更新于 ${formatTime(item.updatedAt)}`;
  // 紧凑模式靠 items-stretch 对齐行高；勿用 h-full（父级无固定高度会塌成 0）
  const thumbClass = compact
    ? 'aspect-[4/3] min-h-12 w-auto shrink-0'
    : 'w-24 aspect-[4/3]';

  return (
    <div
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-4',
        compact ? 'py-4' : 'py-6',
      )}
    >
      <div
        className={cn(
          'flex min-w-0 flex-1 gap-3',
          compact ? 'items-stretch' : 'items-start',
        )}
      >
        <Link
          to={editTo}
          className={cn(
            'relative block shrink-0 overflow-hidden rounded-md bg-muted',
            thumbClass,
          )}
          aria-label={`编辑 ${item.title}`}
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
              <TypeIcon className={compact ? 'size-4' : 'size-5'} />
            </div>
          )}
        </Link>
        <div className="min-w-0 flex-1 space-y-1">
          <Link
            to={editTo}
            className={cn(
              'inline-block max-w-full truncate font-heading text-base font-medium hover:underline',
              compact ? 'leading-normal' : 'leading-7',
            )}
            title={item.title}
          >
            {item.title}
          </Link>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <Badge variant="secondary" className="h-auto gap-1 text-xs font-normal [&>svg]:size-3!">
              <TypeIcon />
              {meta.label}
            </Badge>
            <Badge variant={published ? 'default' : 'outline'} className="h-auto text-xs">
              {published ? '已发布' : '草稿'}
            </Badge>
            {dist.total > 0 ? (
              <button
                type="button"
                className="inline hover:underline"
                onClick={onShowDetails}
              >
                {dist.line}
              </button>
            ) : glance.scheduled ? (
              <span>{glance.label}</span>
            ) : (
              <span>暂无分发</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end justify-between self-stretch">
        <div className="flex flex-wrap items-center justify-end gap-1">
          {authExpiredTargets.length > 0 ? (
            <Button size="sm" variant="ghost" nativeButton={false} render={<Link to="/platform-accounts" />}>
              去重新授权
            </Button>
          ) : (
            retryableTargets.map((target) => (
              <Button
                key={target.id}
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  onRetryTarget(target);
                }}
              >
                <RotateCcw data-icon="inline-start" />
                {retryableTargets.length === 1 ? '重试' : target.platform}
              </Button>
            ))
          )}
          <Button size="sm" variant="ghost" disabled={busy} nativeButton={false} render={<Link to={editTo} />}>
            <Pencil data-icon="inline-start" />
            编辑
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 data-icon="inline-start" />
            删除
          </Button>
        </div>
        <span className="text-right text-sm text-muted-foreground" title={timeFull}>
          {compact ? timeLabel : timeFull}
        </span>
      </div>
    </div>
  );
}

function ContentTargetDetailsSheet({
  item,
  onOpenChange,
  busy,
  onRetryTarget,
}: {
  item: ContentItem | null;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onRetryTarget: (target: ContentTargetItem) => void;
}) {
  const open = item !== null;
  if (!item) {
    return null;
  }

  const meta = TYPE_META[item.type];
  const published = item.status === 'published';
  const dist = summarizeTargets(item.targets);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="pr-8">{item.title}</SheetTitle>
          <SheetDescription>
            {meta.label}
            {' · '}
            {published ? '已发布' : '草稿'}
            {' · '}
            {dist.line}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
          {item.targets.length === 0 ? (
            <p className="text-muted-foreground">尚未配置分发账号。</p>
          ) : (
            item.targets.map((target) => {
              const failed =
                target.publishStatus === 'failed' ||
                target.publishStatus === 'cancelled';
              const authExpired = target.errorCode === 'AUTH_EXPIRED';
              return (
                <div
                  key={target.id}
                  className="flex flex-col gap-2 rounded-lg border p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{target.platform}</p>
                      <p className="text-xs text-muted-foreground">
                        {TARGET_STATUS_LABEL[target.publishStatus] ??
                          target.publishStatus}
                      </p>
                    </div>
                    <Badge
                      variant={
                        target.publishStatus === 'succeeded'
                          ? 'default'
                          : failed
                            ? 'destructive'
                            : target.publishStatus === 'queued' ||
                                target.publishStatus === 'running'
                              ? 'secondary'
                              : 'outline'
                      }
                    >
                      {TARGET_STATUS_LABEL[target.publishStatus] ??
                        target.publishStatus}
                    </Badge>
                  </div>
                  {target.errorMessage || target.errorCode ? (
                    <p className="text-xs text-destructive">
                      {describePublishError(target.errorCode, target.errorMessage)}
                    </p>
                  ) : null}
                  {failed ? (
                    <div className="flex flex-wrap gap-2">
                      {authExpired ? (
                        <Button
                          size="sm"
                          variant="outline"
                          nativeButton={false}
                          render={<Link to="/platform-accounts" />}
                        >
                          去重新授权
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => {
                            onRetryTarget(target);
                          }}
                        >
                          <RotateCcw data-icon="inline-start" />
                          重试
                        </Button>
                      )}
                    </div>
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
