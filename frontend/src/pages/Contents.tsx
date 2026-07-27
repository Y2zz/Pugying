import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clapperboard, FileText, ImageIcon, MoreHorizontal, Pencil, RefreshCw, Send, Share2, Trash2, Undo2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { deleteContent, fetchContents, updateContent, type ContentItem, type ContentType } from '@/lib/api';

type TypeFilter = 'all' | ContentType;

const TYPE_META: Record<ContentType, { label: string; icon: typeof FileText }> = {
  article: { label: '图文', icon: FileText },
  video: { label: '视频', icon: Clapperboard },
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

export default function Contents() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [filter, setFilter] = useState<TypeFilter>('all');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const reload = async () => {
    setLoading(true);
    setError('');
    try {
      setItems(await fetchContents());
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
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

  const visible = filter === 'all' ? items : items.filter((item) => item.type === filter);

  const handleToggleStatus = async (item: ContentItem) => {
    setBusyId(item.id);
    setError('');
    try {
      const updated = await updateContent(item.id, {
        status: item.status === 'published' ? 'draft' : 'published',
      });
      setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (item: ContentItem) => {
    if (!window.confirm(`确定删除「${item.title}」？`)) {
      return;
    }
    setBusyId(item.id);
    setError('');
    try {
      await deleteContent(item.id);
      setItems((prev) => prev.filter((it) => it.id !== item.id));
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
          <h1 className="text-2xl font-semibold tracking-tight">内容管理</h1>
          <p className="text-sm text-muted-foreground">管理团队的图文与视频内容，可在左侧「发布」入口创建新内容</p>
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
              <TabsTrigger value="article">图文</TabsTrigger>
              <TabsTrigger value="video">视频</TabsTrigger>
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
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
              <ImageIcon />
            </EmptyMedia>
            <EmptyTitle>暂无内容</EmptyTitle>
            <EmptyDescription>使用左侧菜单上方的「发布」按钮创建第一条图文或视频内容。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((item) => (
            <ContentCard
              key={item.id}
              item={item}
              busy={busyId === item.id}
              onToggleStatus={() => {
                void handleToggleStatus(item);
              }}
              onDelete={() => {
                void handleDelete(item);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ContentCard({ item, busy, onToggleStatus, onDelete }: { item: ContentItem; busy: boolean; onToggleStatus: () => void; onDelete: () => void }) {
  const meta = TYPE_META[item.type];
  const TypeIcon = meta.icon;
  const published = item.status === 'published';

  return (
    <Card className="h-full gap-3 overflow-hidden pt-0 pb-0">
      <div className="relative aspect-video w-full bg-muted">
        {item.coverUrl ? (
          <img src={item.coverUrl} alt={item.title} className="size-full object-cover" loading="lazy" />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <TypeIcon className="size-8" />
          </div>
        )}
        <div className="absolute top-2 left-2 flex gap-1.5">
          <Badge variant="secondary" className="bg-background/80 backdrop-blur">
            <TypeIcon />
            {meta.label}
          </Badge>
          <Badge variant={published ? 'default' : 'outline'} className={published ? undefined : 'bg-background/80 backdrop-blur'}>
            {published ? '已发布' : '草稿'}
          </Badge>
        </div>
      </div>
      <CardContent className="flex flex-col gap-1">
        <p className="line-clamp-1 font-medium" title={item.title}>
          {item.title}
        </p>
        <p className="line-clamp-2 min-h-8 text-xs text-muted-foreground">{item.body || '暂无描述'}</p>
        {item.targets.length > 0 ? (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Share2 className="size-3" />
            分发 {item.targets.length} 个账号
            {item.scheduledAt ? ` · 定时 ${formatTime(item.scheduledAt)}` : ''}
          </p>
        ) : null}
      </CardContent>
      <CardFooter className="mt-auto justify-between">
        <span className="text-xs text-muted-foreground">{published ? `发布于 ${formatTime(item.publishedAt)}` : `更新于 ${formatTime(item.updatedAt)}`}</span>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" disabled={busy} />}>
            <MoreHorizontal />
            <span className="sr-only">操作</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={onToggleStatus}>
                {published ? <Undo2 /> : <Send />}
                {published ? '撤回为草稿' : '发布'}
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link to={item.type === 'article' ? `/publish/article?id=${item.id}` : `/publish/video?id=${item.id}`} />}>
                <Pencil />
                编辑
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
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
