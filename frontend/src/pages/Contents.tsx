import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  Clapperboard,
  Clock,
  FileText,
  ImageIcon,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  RotateCcw,
  SearchIcon,
  Trash2,
  Undo2,
  XIcon,
} from 'lucide-react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
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

const TYPE_FILTER_OPTIONS: Array<{ value: TypeFilter; label: string }> = [
  { value: 'all', label: '全部类型' },
  { value: 'article', label: '图文' },
  { value: 'video', label: '视频' },
];

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
  const [filter, setFilter] = useState<TypeFilter>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const loadSeqRef = useRef(0);

  // 服务端筛选：type + q；显式传入 next，避免 setState 异步读到旧值
  const reload = async (
    nextFilter: TypeFilter = filter,
    nextQuery: string = query,
  ) => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    setError('');
    try {
      const rows = await fetchContents({
        type: nextFilter === 'all' ? undefined : nextFilter,
        q: nextQuery.trim() || undefined,
      });
      if (seq !== loadSeqRef.current) {
        return;
      }
      setItems(rows);
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
      void reload(filter, query);
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
    void reload('all', '');
  };

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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">作品管理</h1>
        <p className="text-sm text-muted-foreground">
          回看与重试分发结果；新建请走左侧「发布 → 发布视频」
        </p>
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
              void reload(next, query);
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="pt-0">
              <Skeleton className="aspect-[4/3] w-full rounded-none" />
              <CardHeader>
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : items.length === 0 && !query.trim() ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ImageIcon />
            </EmptyMedia>
            <EmptyTitle>{filter === 'all' ? '暂无作品' : `暂无${TYPE_META[filter].label}`}</EmptyTitle>
            <EmptyDescription>
              {filter === 'all'
                ? '使用左侧菜单上方的「发布」按钮创建第一条图文或视频作品。'
                : '可改回「全部类型」查看其它作品，或通过「发布」创建新作品。'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : items.length === 0 ? (
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
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
  const [detailsOpen, setDetailsOpen] = useState(false);
  const meta = TYPE_META[item.type];
  const TypeIcon = meta.icon;
  const published = item.status === 'published';
  const dist = summarizeTargets(item.targets);
  const glance = glanceStatus(item);
  const failedTargets = item.targets.filter(
    (t) => t.publishStatus === 'failed' || t.publishStatus === 'cancelled',
  );
  const authExpiredTargets = failedTargets.filter((t) => t.errorCode === 'AUTH_EXPIRED');
  const retryableTargets = failedTargets.filter((t) => t.errorCode !== 'AUTH_EXPIRED');
  const editTo = editPath(item);

  const handleRetryFailed = () => {
    const target = retryableTargets[0];
    if (target) {
      onRetryTarget(target);
    }
  };

  return (
    // 默认 size → CardTitle 即为 text-base；pt-0 仅用于封面顶齐
    <Card className="h-full pt-0">
      <div className="relative aspect-[4/3] bg-muted">
        <Link
          to={editTo}
          className="absolute inset-0 block"
          aria-label={`编辑 ${item.title}`}
        >
          {item.coverUrl ? (
            <MediaPreviewImage
              src={item.coverUrl}
              alt={item.title}
              className="absolute inset-0 size-full rounded-none border-0"
              objectFit="cover"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-muted-foreground">
              <TypeIcon className="size-8" />
            </div>
          )}
        </Link>
        <div className="pointer-events-none absolute top-2 left-2 flex flex-wrap gap-1.5">
          {/* 叠层半透明特例：封面图深浅不一，Badge variant 无法保证叠层可读。 */}
          <Badge variant="secondary" className="bg-background/80 backdrop-blur">
            <TypeIcon />
            {meta.label}
          </Badge>
          <Badge
            variant={
              glance.tone === 'outline'
                ? 'outline'
                : glance.tone === 'destructive'
                  ? 'destructive'
                  : glance.tone === 'secondary'
                    ? 'secondary'
                    : 'default'
            }
            className={
              glance.tone === 'outline' || glance.tone === 'secondary'
                ? 'bg-background/80 backdrop-blur'
                : undefined
            }
          >
            {glance.scheduled ? <Clock /> : null}
            {glance.label}
          </Badge>
        </div>
      </div>

      <CardHeader>
        <CardTitle>
          <Link to={editTo} className="line-clamp-1" title={item.title}>
            {item.title}
          </Link>
        </CardTitle>
        {item.body ? (
          <CardDescription className="line-clamp-2">{item.body}</CardDescription>
        ) : null}
      </CardHeader>

      <CardContent>
        {dist.total > 0 ? (
          <button
            type="button"
            className="text-left text-muted-foreground hover:underline"
            onClick={() => {
              setDetailsOpen(true);
            }}
          >
            {dist.line}
          </button>
        ) : (
          <p className="text-muted-foreground">暂无分发</p>
        )}
      </CardContent>

      <CardFooter className="mt-auto gap-2">
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          {published ? '已发布' : '草稿'}
          {' · '}
          {published
            ? `发布于 ${formatTime(item.publishedAt)}`
            : `更新于 ${formatTime(item.updatedAt)}`}
        </span>
        {authExpiredTargets.length > 0 ? (
          <Button size="sm" variant="outline" render={<Link to="/platform-accounts" />}>
            去重新授权
          </Button>
        ) : retryableTargets.length > 0 ? (
          <Button size="sm" disabled={busy} onClick={handleRetryFailed}>
            <RotateCcw data-icon="inline-start" />
            重试失败
          </Button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" disabled={busy} />}
          >
            <MoreHorizontal />
            <span className="sr-only">操作</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem render={<Link to={editTo} />}>
                <Pencil />
                编辑
              </DropdownMenuItem>
              {published ? (
                <DropdownMenuItem onClick={onRevertDraft}>
                  <Undo2 />
                  撤回为草稿
                </DropdownMenuItem>
              ) : null}
              {retryableTargets.length > 1
                ? retryableTargets.map((target) => (
                    <DropdownMenuItem
                      key={target.id}
                      onClick={() => {
                        onRetryTarget(target);
                      }}
                    >
                      <RotateCcw />
                      重试 {target.platform}
                    </DropdownMenuItem>
                  ))
                : null}
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
                <Trash2 />
                删除
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardFooter>

      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
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
              <p className="text-sm text-muted-foreground">尚未配置分发账号。</p>
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
    </Card>
  );
}
