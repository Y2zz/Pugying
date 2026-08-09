import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Clapperboard,
  FileText,
  ImageIcon,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  RotateCcw,
  Share2,
  Trash2,
  Undo2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MediaPreviewImage } from '@/components/MediaPreviewImage';
import { agentClient } from '@/lib/agent-client';
import {
  completeContentTarget,
  deleteContent,
  fetchContents,
  retryContentTarget,
  startContentTarget,
  updateContent,
  type ContentItem,
  type ContentTargetItem,
  type ContentType,
  type TargetPublishStatus,
} from '@/lib/api';
import { describeCaughtError, describePublishError } from '@/lib/publish-errors';

type TypeFilter = 'all' | ContentType;

const TYPE_META: Record<ContentType, { label: string; icon: typeof FileText }> =
  {
    article: { label: '图文', icon: FileText },
    video: { label: '视频', icon: Clapperboard },
  };

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
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function summarizeTargets(targets: ContentTargetItem[]): {
  label: string;
  tone: 'default' | 'secondary' | 'outline' | 'destructive';
} {
  if (targets.length === 0) {
    return { label: '无分发', tone: 'outline' };
  }
  const succeeded = targets.filter((t) => t.publishStatus === 'succeeded').length;
  const failed = targets.filter(
    (t) => t.publishStatus === 'failed' || t.publishStatus === 'cancelled',
  ).length;
  const running = targets.filter(
    (t) => t.publishStatus === 'queued' || t.publishStatus === 'running',
  ).length;
  if (running > 0) {
    return { label: '发布中', tone: 'secondary' };
  }
  if (succeeded > 0 && failed > 0) {
    return { label: '部分成功', tone: 'default' };
  }
  if (succeeded === targets.length) {
    return { label: '全部成功', tone: 'default' };
  }
  if (failed > 0 && succeeded === 0) {
    return { label: '发布失败', tone: 'destructive' };
  }
  return { label: '未推送', tone: 'outline' };
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

  const visible =
    filter === 'all' ? items : items.filter((item) => item.type === filter);

  const handleRevertDraft = async (item: ContentItem) => {
    setBusyId(item.id);
    setError('');
    try {
      const updated = await updateContent(item.id, { status: 'draft' });
      setItems((prev) =>
        prev.map((it) => (it.id === updated.id ? updated : it)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setBusyId(null);
    }
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
        throw new Error('本机 Agent 未连接，请先启动桌面 Agent');
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
        mediaUrl: payload.mediaUrl,
        coverUrl: payload.coverUrl,
        coverLandscapeUrl: payload.coverLandscapeUrl,
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
          <p className="text-sm text-muted-foreground">
            回看与重试分发结果；新建请走左侧「发布 → 发布视频」
          </p>
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
            <EmptyDescription>
              使用左侧菜单上方的「发布」按钮创建第一条图文或视频内容。
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((item) => (
            <ContentCard
              key={item.id}
              item={item}
              busy={busyId === item.id || busyId?.startsWith(`${item.id}:`) === true}
              onRevertDraft={() => {
                void handleRevertDraft(item);
              }}
              onRetryTarget={(target) => {
                void handleRetryTarget(item, target);
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

function ContentCard({
  item,
  busy,
  onRevertDraft,
  onRetryTarget,
  onDelete,
}: {
  item: ContentItem;
  busy: boolean;
  onRevertDraft: () => void;
  onRetryTarget: (target: ContentTargetItem) => void;
  onDelete: () => void;
}) {
  const meta = TYPE_META[item.type];
  const TypeIcon = meta.icon;
  const published = item.status === 'published';
  const dist = summarizeTargets(item.targets);
  const failedTargets = item.targets.filter(
    (t) => t.publishStatus === 'failed' || t.publishStatus === 'cancelled',
  );

  return (
    <Card className="h-full gap-3 overflow-hidden pt-0 pb-0">
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        {item.coverUrl ? (
          <MediaPreviewImage
            src={item.coverUrl}
            alt={item.title}
            className="absolute inset-0 size-full rounded-none border-0"
            objectFit="contain"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <TypeIcon className="size-8" />
          </div>
        )}
        <div className="absolute top-2 left-2 flex flex-wrap gap-1.5">
          <Badge
            variant="secondary"
            className="bg-background/80 backdrop-blur"
          >
            <TypeIcon />
            {meta.label}
          </Badge>
          <Badge
            variant={published ? 'default' : 'outline'}
            className={published ? undefined : 'bg-background/80 backdrop-blur'}
          >
            {published ? '已发布' : '草稿'}
          </Badge>
          {item.targets.length > 0 ? (
            <Badge variant={dist.tone}>{dist.label}</Badge>
          ) : null}
        </div>
      </div>
      <CardContent className="flex flex-col gap-1">
        <p className="line-clamp-1 font-medium" title={item.title}>
          {item.title}
        </p>
        <p className="line-clamp-2 min-h-8 text-xs text-muted-foreground">
          {item.body || '暂无描述'}
        </p>
        {item.targets.length > 0 ? (
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            <p className="flex items-center gap-1">
              <Share2 className="size-3" />
              分发 {item.targets.length} 个账号
              {item.scheduledAt ? ` · 定时 ${formatTime(item.scheduledAt)}` : ''}
            </p>
            <ul className="space-y-0.5 pl-4">
              {item.targets.map((target) => (
                <li key={target.id}>
                  {target.platform} ·{' '}
                  {TARGET_STATUS_LABEL[target.publishStatus] ??
                    target.publishStatus}
                  {target.errorMessage || target.errorCode
                    ? `（${describePublishError(target.errorCode, target.errorMessage)}）`
                    : ''}
                  {target.errorCode === 'AUTH_EXPIRED' ? (
                    <>
                      {' '}
                      <Link
                        to="/platform-accounts"
                        className="underline underline-offset-2"
                      >
                        去重新授权
                      </Link>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
      <CardFooter className="mt-auto justify-between">
        <span className="text-xs text-muted-foreground">
          {published
            ? `发布于 ${formatTime(item.publishedAt)}`
            : `更新于 ${formatTime(item.updatedAt)}`}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" disabled={busy} />}
          >
            <MoreHorizontal />
            <span className="sr-only">操作</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              {published ? (
                <DropdownMenuItem onClick={onRevertDraft}>
                  <Undo2 />
                  撤回为草稿
                </DropdownMenuItem>
              ) : null}
              {failedTargets.map((target) => (
                <DropdownMenuItem
                  key={target.id}
                  onClick={() => {
                    onRetryTarget(target);
                  }}
                >
                  <RotateCcw />
                  重试 {target.platform}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem
                render={
                  <Link
                    to={
                      item.type === 'article'
                        ? `/publish/article?id=${item.id}`
                        : `/publish/video?id=${item.id}`
                    }
                  />
                }
              >
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
