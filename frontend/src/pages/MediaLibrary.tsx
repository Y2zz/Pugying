import { useEffect, useState } from 'react';
import { Clapperboard, FolderOpen, ImageIcon, MoreHorizontal, RefreshCw, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MediaPreviewImage } from '@/components/MediaPreviewImage';
import { deleteMediaAsset, fetchMediaAssets, fetchMediaSignedUrl, parseMediaAssetId, type MediaLibraryCategory, type MediaLibraryItem } from '@/lib/api';

type TypeFilter = 'all' | MediaLibraryCategory;

/** 媒体库卡片网格：默认 1 列，随断点递增，宽屏最多 6 列，避免窄屏硬挤 6 列 */
const MEDIA_GRID_CLASS = 'grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6';

const KIND_LABEL: Record<MediaLibraryItem['kind'], string> = {
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
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function MediaLibrary() {
  const [items, setItems] = useState<MediaLibraryItem[]>([]);
  const [filter, setFilter] = useState<TypeFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<MediaLibraryItem | null>(null);

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

  const visible = filter === 'all' ? items : items.filter((item) => item.category === filter);

  const handleDelete = async (item: MediaLibraryItem) => {
    if (!window.confirm(`确定删除「${item.originalName}」？`)) {
      return;
    }
    setBusyId(item.id);
    setError('');
    try {
      await deleteMediaAsset(item.id);
      setItems((prev) => prev.filter((it) => it.id !== item.id));
      if (previewItem?.id === item.id) {
        setPreviewItem(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">媒体库</h1>
          <p className="text-sm text-muted-foreground">查看本团队上传过的视频与图片资源；点击标题或预览图可打开预览</p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs
            value={filter}
            onValueChange={(value) => {
              setFilter((value as TypeFilter) ?? 'all');
            }}
          >
            <TabsList>
              <TabsTrigger value="all">全部</TabsTrigger>
              <TabsTrigger value="video">视频</TabsTrigger>
              <TabsTrigger value="image">图片</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            variant="outline"
            size="sm"
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

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {loading ? (
        <div className={MEDIA_GRID_CLASS}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="gap-3 overflow-hidden pt-0 pb-4">
              <Skeleton className="aspect-video w-full rounded-none" />
              <CardContent className="flex flex-col gap-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderOpen />
            </EmptyMedia>
            <EmptyTitle>暂无资源</EmptyTitle>
            <EmptyDescription>在「发布视频」中上传视频或封面后，会出现在这里。</EmptyDescription>
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
              onDelete={() => {
                void handleDelete(item);
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
    </div>
  );
}

function MediaAssetCard({ item, busy, onPreview, onDelete }: { item: MediaLibraryItem; busy: boolean; onPreview: () => void; onDelete: () => void }) {
  const isVideo = item.category === 'video';
  const TypeIcon = isVideo ? Clapperboard : ImageIcon;

  return (
    <Card className="gap-3 overflow-hidden pt-0 pb-4">
      <button
        type="button"
        className="block w-full cursor-pointer text-left transition-opacity outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onClick={onPreview}
        aria-label={`预览 ${item.originalName}`}
      >
        {isVideo ? (
          <MediaVideoPoster
            src={item.url}
            className="relative aspect-video w-full overflow-hidden rounded-none border-0 border-b"
          />
        ) : (
          // 列表卡片统一 16:9；竖/横原图不符时 cover 居中裁剪，不用 contain 留灰边
          <MediaPreviewImage
            src={item.url}
            alt={item.originalName}
            className="aspect-video w-full rounded-none border-0 border-b"
            aspectRatio={16 / 9}
            objectFit="cover"
          />
        )}
      </button>
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div
            className="line-clamp-2 min-w-0 flex-1 cursor-pointer items-center text-sm leading-snug font-medium hover:underline"
            onClick={onPreview}
            title={item.originalName}
          >
            {item.originalName}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" disabled={busy} />}>
              <MoreHorizontal />
              <span className="sr-only">操作</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem variant="destructive" onClick={onDelete}>
                  <Trash2 />
                  删除
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="gap-1 font-normal">
            <TypeIcon className="size-3" />
            {isVideo ? '视频' : '图片'}
          </Badge>
          {!isVideo ? (
            <Badge variant="outline" className="font-normal">
              {KIND_LABEL[item.kind]}
            </Badge>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          {formatBytes(item.sizeBytes)} · {formatTime(item.createdAt)}
        </p>
      </CardContent>
      <CardFooter className="text-xs text-muted-foreground">{item.mimeType}</CardFooter>
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
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="gap-4 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="pr-8 break-all">{item?.originalName ?? '资源预览'}</DialogTitle>
          <DialogDescription>{item ? `${isVideo ? '视频' : '图片'} · ${formatBytes(item.sizeBytes)} · ${item.mimeType}` : ''}</DialogDescription>
        </DialogHeader>

        <div className="relative flex max-h-[min(70vh,36rem)] min-h-48 w-full items-center justify-center overflow-hidden rounded-lg bg-muted">
          {loading ? (
            <p className="text-sm text-muted-foreground">加载中…</p>
          ) : loadError ? (
            <p className="px-4 text-center text-sm text-destructive">{loadError}</p>
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
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-2 text-muted-foreground">
          <Clapperboard className="size-8 opacity-60" />
          <span className="text-center text-xs">{failed ? '封面加载失败' : '加载封面…'}</span>
        </div>
      )}
    </div>
  );
}
