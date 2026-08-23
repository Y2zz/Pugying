import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Clapperboard, FolderOpen, ImageIcon, RefreshCw, RotateCcw, SearchIcon, Trash2, XIcon } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { MediaPreviewImage } from '@/components/MediaPreviewImage';
import { toast } from '@/components/AppToaster';
import { deleteMediaAsset, fetchMediaAssets, fetchMediaSignedUrl, parseMediaAssetId, type MediaLibraryCategory, type MediaLibraryItem } from '@/lib/api';
import { cn } from '@/lib/utils';

type TypeFilter = 'all' | MediaLibraryCategory;

/** 媒体库卡片网格：宽屏最多 5 列，避免卡片过碎、文件名难读 */
const MEDIA_GRID_CLASS = 'grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5';

const TYPE_FILTER_OPTIONS: Array<{ value: TypeFilter; label: string }> = [
  { value: 'all', label: '全部类型' },
  { value: 'video', label: '视频' },
  { value: 'image', label: '图片' },
];

/** 角标短文案；搜索仍可用完整 KIND_SEARCH_LABEL */
const KIND_BADGE: Record<MediaLibraryItem['kind'], string> = {
  video: '视频',
  cover: '竖版',
  cover_landscape: '横版',
};

const KIND_SEARCH_LABEL: Record<MediaLibraryItem['kind'], string> = {
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

/** 列表缩略图统一 4:3，避免混排时高低不一 */
function thumbAspect(): { className: string; ratio: number } {
  return { className: 'aspect-[4/3]', ratio: 4 / 3 };
}

export default function MediaLibrary() {
  const [items, setItems] = useState<MediaLibraryItem[]>([]);
  const [filter, setFilter] = useState<TypeFilter>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<MediaLibraryItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MediaLibraryItem | null>(null);

  const reload = async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await fetchMediaAssets();
      setItems(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initial = setTimeout(() => {
      void reload();
    }, 0);
    return () => {
      clearTimeout(initial);
    };
  }, []);

  // 类型为搜索条件（本地筛）；列表默认一次拉全量，避免切类型反复请求
  const typed = filter === 'all' ? items : items.filter((item) => item.category === filter);
  const q = query.trim().toLowerCase();
  const visible = !q
    ? typed
    : typed.filter((item) => {
        if (item.originalName.toLowerCase().includes(q)) {
          return true;
        }
        if (KIND_SEARCH_LABEL[item.kind].toLowerCase().includes(q)) {
          return true;
        }
        if (item.mimeType.toLowerCase().includes(q)) {
          return true;
        }
        const categoryLabel = item.category === 'video' ? '视频' : '图片';
        return categoryLabel.includes(q);
      });

  // 关键词或类型任一偏离默认时，允许一键重置
  const hasSearchFilters = Boolean(query.trim()) || filter !== 'all';

  const resetSearchFilters = () => {
    setQuery('');
    setFilter('all');
  };

  const handleConfirmDelete = async (target: MediaLibraryItem) => {
    setBusyId(target.id);
    try {
      await deleteMediaAsset(target.id);
      setItems((prev) => prev.filter((it) => it.id !== target.id));
      if (previewItem?.id === target.id) {
        setPreviewItem(null);
      }
      setDeleteTarget(null);
      toast.add({
        type: 'success',
        title: '已删除',
        description: `「${target.originalName}」已从媒体库移除`,
      });
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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">媒体库</h1>
        <p className="text-sm text-muted-foreground">查看本团队上传过的视频与图片资源；点击标题或预览图可打开预览</p>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>加载失败</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
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
              setFilter((value as TypeFilter) ?? 'all');
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

      {loading ? (
        <div className={MEDIA_GRID_CLASS}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="gap-3 overflow-hidden pt-0 pb-4">
              <Skeleton className="aspect-[4/3] w-full rounded-none" />
              <CardContent className="flex flex-col gap-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : typed.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderOpen />
            </EmptyMedia>
            <EmptyTitle>{filter === 'all' ? '暂无资源' : filter === 'video' ? '暂无视频' : '暂无图片'}</EmptyTitle>
            <EmptyDescription>
              {filter === 'all'
                ? '在「发布视频」中上传视频或封面后，会出现在这里。'
                : '可改回「全部类型」查看其它资源，或在「发布视频」中上传。'}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button render={<Link to="/publish/video" />}>去发布视频</Button>
          </EmptyContent>
        </Empty>
      ) : visible.length === 0 ? (
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
        <div className={MEDIA_GRID_CLASS}>
          {visible.map((item) => (
            <MediaAssetCard
              key={item.id}
              item={item}
              busy={busyId === item.id}
              onPreview={() => {
                setPreviewItem(item);
              }}
              onRequestDelete={() => {
                setDeleteTarget(item);
              }}
            />
          ))}
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
    </div>
  );
}

function MediaAssetCard({
  item,
  busy,
  onPreview,
  onRequestDelete,
}: {
  item: MediaLibraryItem;
  busy: boolean;
  onPreview: () => void;
  onRequestDelete: () => void;
}) {
  const isVideo = item.category === 'video';
  const aspect = thumbAspect();
  const TypeIcon = isVideo ? Clapperboard : ImageIcon;

  return (
    <Card className="gap-3 overflow-hidden pt-0 pb-4">
      {/* group：悬停露出删除；类型角标叠在缩略图上，正文只留文件名与体积时间 */}
      <div className="group/media relative">
        <button
          type="button"
          className="block w-full cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          onClick={onPreview}
          aria-label={`预览 ${item.originalName}`}
        >
          {isVideo ? (
            <MediaVideoPoster src={item.url} className={cn('relative w-full overflow-hidden rounded-none border-0 border-b', aspect.className)} />
          ) : (
            <MediaPreviewImage
              src={item.url}
              alt={item.originalName}
              className={cn('w-full rounded-none border-0 border-b', aspect.className)}
              aspectRatio={aspect.ratio}
              objectFit="cover"
            />
          )}
        </button>
        <Badge variant="secondary" className="pointer-events-none absolute top-2 left-2 gap-1 font-normal shadow-xs">
          <TypeIcon />
          {KIND_BADGE[item.kind]}
        </Badge>
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          disabled={busy}
          aria-label={`删除 ${item.originalName}`}
          className="absolute top-2 right-2 opacity-100 shadow-xs transition-opacity sm:opacity-0 sm:group-hover/media:opacity-100"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRequestDelete();
          }}
        >
          <Trash2 />
        </Button>
      </div>
      <CardContent className="flex flex-col gap-1.5">
        <button
          type="button"
          className="line-clamp-1 min-w-0 cursor-pointer truncate text-left text-sm font-medium"
          onClick={onPreview}
          title={item.originalName}
        >
          {item.originalName}
        </button>
        <p className="text-xs text-muted-foreground">
          {formatBytes(item.sizeBytes)} · {formatTime(item.createdAt)}
        </p>
      </CardContent>
    </Card>
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
            {item ? `${KIND_SEARCH_LABEL[item.kind]} · ${formatBytes(item.sizeBytes)}` : ''}
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

function MediaVideoPoster({ src, className }: { src: string; className?: string }) {
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setFailed(false);
      setPosterUrl(null);
      const assetId = parseMediaAssetId(src);
      if (!assetId) {
        setFailed(true);
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
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [src]);

  return (
    <div className={className ?? 'relative aspect-[4/3] w-full overflow-hidden rounded-md border bg-muted'}>
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
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-2 text-muted-foreground">
          <Clapperboard className="size-8 opacity-60" />
          <span className="text-center text-xs">{failed ? '封面加载失败' : '加载封面…'}</span>
        </div>
      )}
    </div>
  );
}
