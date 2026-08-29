import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowDown, ArrowUp, ArrowUpDown, Clapperboard, FolderOpen, ImageIcon, RefreshCw, RotateCcw, SearchIcon, Trash2, XIcon } from 'lucide-react';
import { PageHeader } from '@/components/layouts/PageHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MediaPreviewImage } from '@/components/MediaPreviewImage';
import { toast } from '@/components/AppToaster';
import { useUiDensity } from '@/hooks/use-ui-density';
import { deleteMediaAsset, deleteMediaAssets, fetchMediaAssets, fetchMediaAssetsStats, fetchMediaSignedUrl, parseMediaAssetId, type MediaAssetSortField, type MediaAssetSortOrder, type MediaLibraryCategory, type MediaLibraryItem, type MediaLibraryStats } from '@/lib/api';
import type { UiDensity } from '@/lib/ui-density';
import { cn } from '@/lib/utils';

type TypeFilter = 'all' | MediaLibraryCategory;

const TYPE_FILTER_OPTIONS: Array<{ value: TypeFilter; label: string }> = [
  { value: 'all', label: '全部类型' },
  { value: 'video', label: '视频' },
  { value: 'image', label: '图片' },
];

const MEDIA_PAGE_SIZE = 20;

const DEFAULT_MEDIA_SORT_BY: MediaAssetSortField = 'createdAt';
const DEFAULT_MEDIA_SORT_ORDER: MediaAssetSortOrder = 'desc';

/** UI 未选中排序时仍按默认字段请求 API */
function resolveMediaApiSort(
  uiSortBy: MediaAssetSortField | null,
  uiSortOrder: MediaAssetSortOrder,
): { sortBy: MediaAssetSortField; sortOrder: MediaAssetSortOrder } {
  if (uiSortBy === null) {
    return {
      sortBy: DEFAULT_MEDIA_SORT_BY,
      sortOrder: DEFAULT_MEDIA_SORT_ORDER,
    };
  }
  return { sortBy: uiSortBy, sortOrder: uiSortOrder };
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
    const pageNum = sorted[i]!;
    if (i > 0 && pageNum - sorted[i - 1]! > 1) {
      result.push('gap');
    }
    result.push(pageNum);
  }
  return result;
}

/** 角标短文案 */
const KIND_BADGE: Record<MediaLibraryItem['kind'], string> = {
  video: '视频',
  cover: '竖版',
  cover_landscape: '横版',
};

const KIND_DETAIL_LABEL: Record<MediaLibraryItem['kind'], string> = {
  video: '视频',
  cover: '竖版封面',
  cover_landscape: '横版封面',
};

function formatBytes(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  if (size < 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatTime(value: string): string {
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

/** 紧凑密度用短时间，避免元信息撑开窄卡 */
function formatShortTime(value: string): string {
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

/** 列表缩略图统一 16:9，避免混排时高低不一 */
function thumbAspect(): { className: string; ratio: number } {
  return { className: 'aspect-video', ratio: 16 / 9 };
}

export default function MediaLibrary() {
  const [items, setItems] = useState<MediaLibraryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<TypeFilter>('all');
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<MediaAssetSortField | null>(null);
  const [sortOrder, setSortOrder] = useState<MediaAssetSortOrder>(DEFAULT_MEDIA_SORT_ORDER);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<MediaLibraryItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MediaLibraryItem | null>(null);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [selectAllBusy, setSelectAllBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [stats, setStats] = useState<MediaLibraryStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const { density, compact } = useUiDensity();
  const loadSeqRef = useRef(0);
  const statsSeqRef = useRef(0);

  const reloadStats = async () => {
    const seq = ++statsSeqRef.current;
    setStatsLoading(true);
    try {
      const result = await fetchMediaAssetsStats();
      if (seq !== statsSeqRef.current) {
        return;
      }
      setStats(result);
    } catch {
      if (seq !== statsSeqRef.current) {
        return;
      }
      setStats(null);
    } finally {
      if (seq === statsSeqRef.current) {
        setStatsLoading(false);
      }
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / MEDIA_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageIds = items.map((item) => item.id);
  const pageSelectedCount = pageIds.filter((id) => selectedIds.has(id)).length;
  const pageAllSelected = pageIds.length > 0 && pageSelectedCount === pageIds.length;
  const pageIndeterminate = pageSelectedCount > 0 && !pageAllSelected;
  const allMatchingSelected = total > 0 && selectedIds.size >= total;
  const selectionBusy = batchDeleting || busyId !== null || selectAllBusy;

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const exitBatchMode = () => {
    setBatchMode(false);
    clearSelection();
    setBatchDeleteOpen(false);
  };

  const enterBatchMode = () => {
    setBatchMode(true);
    clearSelection();
  };

  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const togglePageAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (pageAllSelected) {
        for (const id of pageIds) {
          next.delete(id);
        }
      } else {
        for (const id of pageIds) {
          next.add(id);
        }
      }
      return next;
    });
  };

  /** 按当前筛选/搜索选中全部匹配资源（跨页） */
  const selectAllMatching = async () => {
    if (total === 0) {
      return;
    }
    setSelectAllBusy(true);
    try {
      const apiSort = resolveMediaApiSort(sortBy, sortOrder);
      const allIds: string[] = [];
      const fetchPageSize = 100;
      const pages = Math.ceil(total / fetchPageSize);
      for (let p = 1; p <= pages; p++) {
        const result = await fetchMediaAssets({
          type: filter === 'all' ? undefined : filter,
          q: query.trim() || undefined,
          page: p,
          pageSize: fetchPageSize,
          sortBy: apiSort.sortBy,
          sortOrder: apiSort.sortOrder,
        });
        for (const item of result.items) {
          allIds.push(item.id);
        }
      }
      setSelectedIds(new Set(allIds));
    } catch (err) {
      toast.add({
        type: 'error',
        title: '全选失败',
        description: err instanceof Error ? err.message : '加载资源列表失败',
      });
    } finally {
      setSelectAllBusy(false);
    }
  };

  const tableSelection = {
    pageAllSelected,
    pageIndeterminate,
    selectedIds,
    onTogglePageAll: togglePageAll,
    onToggleRow: toggleSelected,
    disabled: selectionBusy,
  };

  const reload = async (
    nextFilter: TypeFilter = filter,
    nextQuery: string = query,
    nextPage: number = page,
    nextSortBy: MediaAssetSortField | null = sortBy,
    nextSortOrder: MediaAssetSortOrder = sortOrder,
  ) => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    setError('');
    const apiSort = resolveMediaApiSort(nextSortBy, nextSortOrder);
    try {
      const result = await fetchMediaAssets({
        type: nextFilter === 'all' ? undefined : nextFilter,
        q: nextQuery.trim() || undefined,
        page: nextPage,
        pageSize: MEDIA_PAGE_SIZE,
        sortBy: apiSort.sortBy,
        sortOrder: apiSort.sortOrder,
      });
      if (seq !== loadSeqRef.current) {
        return;
      }
      const resolvedTotalPages = Math.max(
        1,
        Math.ceil(result.total / MEDIA_PAGE_SIZE),
      );
      const resolvedPage = Math.min(nextPage, resolvedTotalPages);
      if (resolvedPage !== nextPage && result.total > 0) {
        return reload(
          nextFilter,
          nextQuery,
          resolvedPage,
          nextSortBy,
          nextSortOrder,
        );
      }
      setPage(resolvedPage);
      setSortBy(nextSortBy);
      setSortOrder(nextSortOrder);
      setItems(result.items);
      setTotal(result.total);
    } catch (err) {
      if (seq !== loadSeqRef.current) {
        return;
      }
      setError(err instanceof Error ? err.message : '加载失败');
      setItems([]);
      setTotal(0);
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
      void reloadStats();
    }, 0);
    return () => {
      clearTimeout(initial);
    };
    // 仅首屏拉一次；后续由类型切换 / 关键词防抖触发
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only
  }, []);

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
    exitBatchMode();
    void reload('all', '', 1, sortBy, sortOrder);
  };

  const handleSort = (field: MediaAssetSortField) => {
    let nextSortBy: MediaAssetSortField | null;
    let nextSortOrder: MediaAssetSortOrder;

    if (sortBy !== field) {
      // 新列或取消后重选：升序
      nextSortBy = field;
      nextSortOrder = 'asc';
    } else if (sortOrder === 'asc') {
      nextSortBy = field;
      nextSortOrder = 'desc';
    } else {
      // 降序后再点：取消排序，回默认（上传时间降序）
      nextSortBy = null;
      nextSortOrder = DEFAULT_MEDIA_SORT_ORDER;
    }

    setPage(1);
    void reload(filter, query, 1, nextSortBy, nextSortOrder);
  };

  const handleConfirmDelete = async (target: MediaLibraryItem) => {
    setBusyId(target.id);
    try {
      await deleteMediaAsset(target.id);
      if (previewItem?.id === target.id) {
        setPreviewItem(null);
      }
      setDeleteTarget(null);
      toast.add({
        type: 'success',
        title: '已删除',
        description: `「${target.originalName}」已从媒体库移除`,
      });
      void reload(filter, query, page);
      void reloadStats();
    } catch (err) {
      setDeleteTarget(null);
      toast.add({
        type: 'error',
        title: '删除失败',
        description: err instanceof Error ? err.message : '删除失败',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmBatchDelete = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) {
      return;
    }
    setBatchDeleting(true);
    try {
      const deletedIds: string[] = [];
      const missingIds: string[] = [];
      const chunkSize = 100;
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const result = await deleteMediaAssets(chunk);
        deletedIds.push(...result.deletedIds);
        missingIds.push(...result.missingIds);
      }
      if (previewItem && deletedIds.includes(previewItem.id)) {
        setPreviewItem(null);
      }
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of deletedIds) {
          next.delete(id);
        }
        return next;
      });
      setBatchDeleteOpen(false);
      const deletedCount = deletedIds.length;
      toast.add({
        type: 'success',
        title: '已删除',
        description:
          deletedCount === 1
            ? '已从媒体库移除 1 个资源'
            : `已从媒体库移除 ${deletedCount} 个资源`,
      });
      if (missingIds.length > 0) {
        toast.add({
          type: 'warning',
          title: '部分资源未删除',
          description: `${missingIds.length} 个资源不存在或已被删除`,
        });
      }
      const remainingCount = ids.length - deletedIds.length;
      if (remainingCount === 0) {
        exitBatchMode();
      }
      void reload(filter, query, page);
      void reloadStats();
    } catch (err) {
      setBatchDeleteOpen(false);
      toast.add({
        type: 'error',
        title: '批量删除失败',
        description: err instanceof Error ? err.message : '删除失败',
      });
    } finally {
      setBatchDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="媒体库"
        description="查看本团队上传过的视频与图片资源；点击标题或预览图可打开预览"
      />

      {statsLoading && !stats ? (
        <MediaLibraryStatsCards loading compact={compact} stats={null} />
      ) : stats ? (
        <MediaLibraryStatsCards loading={false} compact={compact} stats={stats} />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <InputGroup className="min-w-0 max-w-xs flex-1">
                <InputGroupInput
                  id="media-search"
                  value={query}
                  placeholder="搜索文件名"
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
                <SelectTrigger className="w-36 shrink-0" aria-label="资源类型">
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
              {batchMode ? (
                <>
                  <span className="shrink-0 text-sm text-muted-foreground">
                    已选 {selectedIds.size} 项
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={selectionBusy || total === 0 || allMatchingSelected}
                    onClick={() => {
                      void selectAllMatching();
                    }}
                  >
                    {selectAllBusy ? <Spinner data-icon="inline-start" /> : null}
                    {selectAllBusy ? '加载中…' : '全部选择'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={selectionBusy || selectedIds.size === 0}
                    onClick={clearSelection}
                  >
                    取消选择
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={selectionBusy || selectedIds.size === 0}
                    onClick={() => {
                      setBatchDeleteOpen(true);
                    }}
                  >
                    <Trash2 data-icon="inline-start" />
                    删除
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={selectionBusy}
                    onClick={exitBatchMode}
                  >
                    退出批量操作
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  disabled={loading || total === 0}
                  onClick={enterBatchMode}
                >
                  批量操作
                </Button>
              )}
              <Button
                variant="outline"
                disabled={loading}
                onClick={() => {
                  void reload();
                  void reloadStats();
                }}
              >
                {loading ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
                {loading ? '加载中…' : '刷新'}
              </Button>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>加载失败</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <MediaLibraryTable
          compact={compact}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={handleSort}
          selection={batchMode ? tableSelection : undefined}
        >
          {Array.from({ length: compact ? 8 : 6 }).map((_, i) => (
            <TableRow key={i}>
              {batchMode ? (
                <TableCell className={mediaRowCellClass(compact, 'start')}>
                  <Skeleton className="size-4 rounded-[4px]" />
                </TableCell>
              ) : null}
              <TableCell className={mediaRowCellClass(compact, batchMode ? undefined : 'start')}>
                <Skeleton className={cn('rounded-md', compact ? 'h-10 w-16' : 'h-14 w-24')} />
              </TableCell>
              <TableCell className={mediaRowCellClass(compact)}>
                <Skeleton className="h-4 w-48 max-w-full" />
              </TableCell>
              <TableCell className={mediaRowCellClass(compact)}>
                <Skeleton className="h-5 w-16" />
              </TableCell>
              <TableCell className={mediaRowCellClass(compact)}>
                <Skeleton className="h-4 w-20" />
              </TableCell>
              <TableCell className={mediaRowCellClass(compact)}>
                <Skeleton className="h-4 w-32" />
              </TableCell>
              {!batchMode ? (
                <TableCell className={cn(mediaRowCellClass(compact, 'end'), 'text-right')}>
                  <Skeleton className="ml-auto h-8 w-8 rounded-md" />
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </MediaLibraryTable>
      ) : total === 0 && !hasSearchFilters ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderOpen />
            </EmptyMedia>
            <EmptyTitle>暂无资源</EmptyTitle>
            <EmptyDescription>在「发布视频」中上传视频或封面后，会出现在这里。</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button nativeButton={false} render={<Link to="/publish/video" />}>去发布视频</Button>
          </EmptyContent>
        </Empty>
      ) : total === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchIcon />
            </EmptyMedia>
            <EmptyTitle>未找到匹配资源</EmptyTitle>
            <EmptyDescription>换个关键词试试，或点「重置」清空搜索条件查看全部资源。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-4">
          <MediaLibraryTable
          compact={compact}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={handleSort}
          selection={batchMode ? tableSelection : undefined}
        >
            {items.map((item) => (
              <MediaAssetListRow
                key={item.id}
                item={item}
                density={density}
                busy={busyId === item.id}
                batchMode={batchMode}
                selected={batchMode && selectedIds.has(item.id)}
                selectDisabled={selectionBusy}
                onToggleSelect={(checked) => {
                  toggleSelected(item.id, checked);
                }}
                onPreview={() => {
                  setPreviewItem(item);
                }}
                onRequestDelete={() => {
                  setDeleteTarget(item);
                }}
              />
            ))}
          </MediaLibraryTable>
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

      <MediaAssetPreviewDialog
        item={previewItem}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewItem(null);
          }
        }}
      />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && busyId === null) {
            setDeleteTarget(null);
            // 关闭后不把焦点还回触发卡片，避免残留 focus ring / 删除按钮常显
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
            <AlertDialogTitle>删除资源？</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? `将删除「${deleteTarget.originalName}」。此操作不可恢复。` : null}
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

      <AlertDialog
        open={batchDeleteOpen}
        onOpenChange={(open) => {
          if (!open && !batchDeleting) {
            setBatchDeleteOpen(false);
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
            <AlertDialogTitle>批量删除资源？</AlertDialogTitle>
            <AlertDialogDescription>
              将删除已选的 {selectedIds.size} 个资源。此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={batchDeleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={batchDeleting}
              onClick={() => {
                void handleConfirmBatchDelete();
              }}
            >
              {batchDeleting ? '删除中…' : '删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function mediaRowCellClass(compact: boolean, edge?: 'start' | 'end'): string {
  return cn(
    compact ? 'py-2' : 'py-3',
    'whitespace-normal',
    edge === 'start' && 'pl-4',
    edge === 'end' && 'pr-4',
  );
}

function MediaLibraryTable({
  compact,
  sortBy,
  sortOrder,
  onSort,
  selection,
  children,
}: {
  compact: boolean;
  sortBy: MediaAssetSortField | null;
  sortOrder: MediaAssetSortOrder;
  onSort: (field: MediaAssetSortField) => void;
  selection?: {
    pageAllSelected: boolean;
    pageIndeterminate: boolean;
    selectedIds: Set<string>;
    onTogglePageAll: () => void;
    onToggleRow: (id: string, checked: boolean) => void;
    disabled?: boolean;
  };
  children: ReactNode;
}) {
  const headHeight = compact ? 'h-9' : 'h-10';
  const headerChecked: boolean | 'indeterminate' = selection?.pageAllSelected
    ? true
    : selection?.pageIndeterminate
      ? 'indeterminate'
      : false;
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow className="border-b hover:bg-transparent">
            {selection ? (
              <TableHead className={cn('w-10 pl-4', headHeight)}>
                <Checkbox
                  aria-label="全选本页"
                  disabled={selection.disabled}
                  checked={headerChecked}
                  onCheckedChange={() => {
                    selection.onTogglePageAll();
                  }}
                />
              </TableHead>
            ) : null}
            <TableHead className={cn('w-28', selection ? undefined : 'pl-4', headHeight)}>
              预览
            </TableHead>
            <SortableTableHead
              label="文件名"
              field="originalName"
              activeField={sortBy}
              activeOrder={sortOrder}
              onSort={onSort}
              className={headHeight}
            />
            <SortableTableHead
              label="类型"
              field="kind"
              activeField={sortBy}
              activeOrder={sortOrder}
              onSort={onSort}
              className={cn('w-28', headHeight)}
            />
            <SortableTableHead
              label="大小"
              field="sizeBytes"
              activeField={sortBy}
              activeOrder={sortOrder}
              onSort={onSort}
              className={cn('w-28', headHeight)}
            />
            <SortableTableHead
              label="上传时间"
              field="createdAt"
              activeField={sortBy}
              activeOrder={sortOrder}
              onSort={onSort}
              className={cn('w-44', headHeight)}
            />
            {!selection ? (
              <TableHead className={cn('w-16 pr-4 text-right', headHeight)}>操作</TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>{children}</TableBody>
      </Table>
    </div>
  );
}

function SortableTableHead({
  label,
  field,
  activeField,
  activeOrder,
  onSort,
  className,
}: {
  label: string;
  field: MediaAssetSortField;
  activeField: MediaAssetSortField | null;
  activeOrder: MediaAssetSortOrder;
  onSort: (field: MediaAssetSortField) => void;
  className?: string;
}) {
  const active = activeField === field;
  return (
    <TableHead className={className}>
      <button
        type="button"
        className={cn(
          'inline-flex items-center gap-1 font-medium transition-colors hover:text-foreground',
          active ? 'text-foreground' : 'text-muted-foreground',
        )}
        onClick={() => {
          onSort(field);
        }}
      >
        {label}
        {active ? (
          activeOrder === 'asc' ? (
            <ArrowUp className="size-3.5" />
          ) : (
            <ArrowDown className="size-3.5" />
          )
        ) : (
          <ArrowUpDown className="size-3.5 opacity-50" />
        )}
      </button>
    </TableHead>
  );
}

function MediaAssetListRow({
  item,
  density,
  busy,
  batchMode,
  selected,
  selectDisabled,
  onToggleSelect,
  onPreview,
  onRequestDelete,
}: {
  item: MediaLibraryItem;
  density: UiDensity;
  busy: boolean;
  batchMode: boolean;
  selected: boolean;
  selectDisabled: boolean;
  onToggleSelect: (checked: boolean) => void;
  onPreview: () => void;
  onRequestDelete: () => void;
}) {
  const isVideo = item.category === 'video';
  const compact = density === 'compact';
  const aspect = thumbAspect();
  const TypeIcon = isVideo ? Clapperboard : ImageIcon;
  const timeFull = formatTime(item.createdAt);
  const timeLabel = compact ? formatShortTime(item.createdAt) : timeFull;
  const thumbClass = compact ? 'h-10 w-16' : 'h-14 w-24';
  const cellClass = mediaRowCellClass(compact);

  return (
    <TableRow className={cn(batchMode && selected && 'bg-muted/40')}>
      {batchMode ? (
        <TableCell className={mediaRowCellClass(compact, 'start')}>
          <Checkbox
            aria-label={`选择 ${item.originalName}`}
            checked={selected}
            disabled={selectDisabled || busy}
            onCheckedChange={(value) => {
              onToggleSelect(!!value);
            }}
          />
        </TableCell>
      ) : null}
      <TableCell className={mediaRowCellClass(compact, batchMode ? undefined : 'start')}>
        <button
          type="button"
          className={cn(
            'relative block overflow-hidden rounded-md bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            thumbClass,
          )}
          onClick={onPreview}
          aria-label={`预览 ${item.originalName}`}
        >
          {isVideo ? (
            <MediaVideoPoster
              src={item.url}
              className="absolute inset-0 size-full overflow-hidden rounded-none border-0"
            />
          ) : (
            <MediaPreviewImage
              src={item.url}
              alt={item.originalName}
              className="absolute inset-0 size-full rounded-none border-0"
              aspectRatio={aspect.ratio}
              objectFit="cover"
            />
          )}
        </button>
      </TableCell>
      <TableCell className={cn(cellClass, 'max-w-xs')}>
        <button
          type="button"
          className="max-w-full truncate font-medium hover:underline"
          title={item.originalName}
          onClick={onPreview}
        >
          {item.originalName}
        </button>
      </TableCell>
      <TableCell className={cellClass}>
        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <TypeIcon className="size-3.5 shrink-0" />
          {KIND_BADGE[item.kind]}
        </span>
      </TableCell>
      <TableCell className={cn(cellClass, 'text-muted-foreground tabular-nums')}>
        {formatBytes(item.sizeBytes)}
      </TableCell>
      <TableCell className={cn(cellClass, 'text-muted-foreground tabular-nums')} title={timeFull}>
        {timeLabel}
      </TableCell>
      {!batchMode ? (
        <TableCell className={cn(mediaRowCellClass(compact, 'end'), 'text-right')}>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={busy}
            aria-label={`删除 ${item.originalName}`}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onRequestDelete}
          >
            <Trash2 />
          </Button>
        </TableCell>
      ) : null}
    </TableRow>
  );
}

function MediaAssetPreviewDialog({ item, onOpenChange }: { item: MediaLibraryItem | null; onOpenChange: (open: boolean) => void }) {
  const open = item !== null;
  const isVideo = item?.category === 'video';
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(false);
  const assetKey = item ? `${item.id}:${item.url}` : null;

  useEffect(() => {
    if (!assetKey || !item) {
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        setLoading(true);
        setLoadError('');
        setMediaUrl(null);
        const assetId = parseMediaAssetId(item.url) ?? item.id;
        try {
          const signed = await fetchMediaSignedUrl(assetId);
          if (!cancelled) {
            setMediaUrl(signed.url);
          }
        } catch (err) {
          if (!cancelled) {
            setLoadError(err instanceof Error ? err.message : '预览加载失败');
          }
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
      })();
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [assetKey, item]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setMediaUrl(null);
          setLoadError('');
          setLoading(false);
          // 关闭后不把焦点还回触发卡片，避免残留 focus ring
          queueMicrotask(() => {
            if (document.activeElement instanceof HTMLElement) {
              document.activeElement.blur();
            }
          });
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="gap-4 sm:max-w-3xl" finalFocus={false}>
        <DialogHeader>
          <DialogTitle className="pr-8 truncate" title={item?.originalName}>
            {item?.originalName ?? '资源预览'}
          </DialogTitle>
          <DialogDescription>
            {item ? `${KIND_DETAIL_LABEL[item.kind]} · ${formatBytes(item.sizeBytes)}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="relative flex max-h-[min(70vh,36rem)] min-h-48 w-full items-center justify-center overflow-hidden rounded-lg bg-muted">
          {loading ? (
            <Skeleton className="size-full min-h-48 rounded-lg" />
          ) : loadError ? (
            <Alert variant="destructive" className="mx-4 w-auto max-w-md">
              <AlertCircle />
              <AlertTitle>预览失败</AlertTitle>
              <AlertDescription>{loadError}</AlertDescription>
            </Alert>
          ) : mediaUrl && item ? (
            isVideo ? (
              <video key={mediaUrl} src={mediaUrl} className="max-h-[min(70vh,36rem)] w-full bg-muted object-contain" controls playsInline preload="metadata" />
            ) : (
              <img src={mediaUrl} alt={item.originalName} className="max-h-[min(70vh,36rem)] max-w-full object-contain" />
            )
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MediaLibraryStatsCards({
  stats,
  loading,
  compact,
}: {
  stats: MediaLibraryStats | null;
  loading: boolean;
  compact: boolean;
}) {
  const cardSize = compact ? 'sm' : 'default';

  if (loading && !stats) {
    return (
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} size={cardSize}>
            <CardHeader>
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-4 w-16" />
            </CardHeader>
          </Card>
        ))}
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const items: Array<{
    label: string;
    value: string;
    desc: string;
    icon: typeof FolderOpen;
  }> = [
    {
      label: '库内资源',
      value: `${stats.totalCount} 个`,
      desc: `合计 ${formatBytes(stats.totalBytes)}`,
      icon: FolderOpen,
    },
    {
      label: '视频',
      value: `${stats.byCategory.video.count} 个`,
      desc: formatBytes(stats.byCategory.video.bytes),
      icon: Clapperboard,
    },
    {
      label: '图片',
      value: `${stats.byCategory.image.count} 个`,
      desc: formatBytes(stats.byCategory.image.bytes),
      icon: ImageIcon,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {items.map((item) => (
        <Card key={item.label} size={cardSize}>
          <CardHeader>
            <div className="flex items-center gap-2">
              <item.icon className="size-4 text-muted-foreground" aria-hidden />
              <CardTitle className="text-muted-foreground">{item.label}</CardTitle>
            </div>
            <div className="font-heading text-2xl font-semibold tracking-tight">{item.value}</div>
            <CardDescription>{item.desc}</CardDescription>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

function MediaVideoPoster({ src, className }: { src: string; className?: string }) {
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [resolving, setResolving] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setFailed(false);
      setPosterUrl(null);
      setResolving(true);
      const assetId = parseMediaAssetId(src);
      if (!assetId) {
        setFailed(true);
        setResolving(false);
        return;
      }
      try {
        const signed = await fetchMediaSignedUrl(assetId);
        if (!cancelled) {
          // #t=0.1 强制解码一帧作为静态封面，不提供播放控件
          setPosterUrl(`${signed.url}#t=0.1`);
        }
      } catch {
        if (!cancelled) {
          setFailed(true);
        }
      } finally {
        if (!cancelled) {
          setResolving(false);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [src]);

  return (
    <div className={className ?? 'relative aspect-video w-full overflow-hidden rounded-md border bg-muted'}>
      {posterUrl && !failed ? (
        <video
          src={posterUrl}
          className="pointer-events-none absolute inset-0 size-full max-h-full max-w-full object-cover object-center"
          muted
          playsInline
          preload="metadata"
          tabIndex={-1}
          aria-hidden
          onError={() => {
            setFailed(true);
          }}
        />
      ) : null}
      {resolving && !failed ? <Skeleton className="absolute inset-0 size-full rounded-none" /> : null}
      {failed ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-2 text-muted-foreground">
          <Clapperboard className="size-8 opacity-60" />
          <span className="text-center text-xs">封面加载失败</span>
        </div>
      ) : null}
    </div>
  );
}
