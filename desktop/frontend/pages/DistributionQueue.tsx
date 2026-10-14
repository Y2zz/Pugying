import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Search,
  SearchX,
  X,
} from "lucide-react";
import type {
  DistributionContentType,
  DistributionPage,
  DistributionTaskRow,
  DistributionTypeFilter,
} from "@shared/distribution";
import { useDistributionState } from "@/components/publishing/DistributionProvider";
import { DistributionPlatformFilter } from "@/components/publishing/DistributionPlatformFilter";
import {
  DISTRIBUTION_TYPES,
  DistributionWorkCard,
} from "@/components/publishing/DistributionWorkCard";
import { PageHeader } from "@/components/layouts/PageHeader";
import { StickyPageHeader } from "@/components/layouts/StickyPageHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
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
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  confirmDistributionPublished,
  fetchDistributionPage,
  type PlatformId,
} from "@/lib/api";
import { PLATFORM_NAMES } from "@/lib/content-management";
import { cn } from "@/lib/utils";
import {
  cancelDistribution,
  retryDistributions,
  submitDistribution,
} from "@/lib/distribution";
import { toast } from "@/lib/app-toast";

const typeOrder: DistributionContentType[] = ["video", "graphic", "article"];
const PAGE_SIZE = 20;
/** 「隐藏已完成」只记在本机，不进服务端 */
export const HIDE_COMPLETED_KEY = "pugying.distribution.hideCompleted";

function readHideCompleted(): boolean {
  try {
    return window.localStorage.getItem(HIDE_COMPLETED_KEY) === "1";
  } catch {
    return false;
  }
}

export default function DistributionQueue() {
  const state = useDistributionState();
  const [type, setType] = useState<DistributionTypeFilter>("all");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [keyword, setKeyword] = useState("");
  const [query, setQuery] = useState("");
  const [hideCompleted, setHideCompleted] = useState(readHideCompleted);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<DistributionPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(keyword.trim()), 300);
    return () => {
      clearTimeout(timer);
    };
  }, [keyword]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchDistributionPage(
      "all",
      page,
      {
        type: type === "all" ? undefined : type,
        platforms: platforms.length > 0 ? platforms : undefined,
        q: query || undefined,
        includeCompleted: !hideCompleted,
      },
      PAGE_SIZE,
    )
      .then((data) => {
        if (!alive) {
          return;
        }
        setResult(data);
        setError("");
        const lastPage = Math.max(1, Math.ceil(data.workTotal / data.pageSize));
        if (page > lastPage) {
          setPage(lastPage);
        }
      })
      .catch(() => {
        if (alive) {
          setError("分发任务更新失败，请重试");
        }
      })
      .finally(() => {
        if (alive) {
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [
    page,
    type,
    platforms,
    query,
    hideCompleted,
    state.version,
    reload,
  ]);

  const tasks = state.snapshot?.tasks ?? [];
  const hasError = Boolean(state.error || error);
  const grouped = useMemo(() => {
    const map = new Map<string, DistributionTaskRow[]>();
    for (const item of result?.items ?? []) {
      const rows = map.get(item.contentId) ?? [];
      rows.push(item);
      map.set(item.contentId, rows);
    }
    return [...map.values()];
  }, [result]);
  /** 「清除全部」（工具栏与空状态）只重置这三项，不动类型标签：平台、关键词或隐藏已完成任一生效即可用 */
  const toolbarFiltered =
    platforms.length > 0 ||
    keyword.trim() !== "" ||
    hideCompleted;

  const workTotal = result?.workTotal ?? 0;
  const pageCount = Math.max(1, Math.ceil(workTotal / PAGE_SIZE));

  const refresh = () => {
    state.refresh();
    setReload((value) => value + 1);
  };
  const typeOnly = type !== "all" && !toolbarFiltered;
  const hideOnly =
    type === "all" &&
    hideCompleted &&
    platforms.length === 0 &&
    !query;
  const noMatch = toolbarFiltered && !hideOnly;
  /** 空状态「当前筛选」：只列出生效的部分 */
  const filterSummary = [
    type !== "all" ? DISTRIBUTION_TYPES[type].label : "",
    platforms.map((id) => PLATFORM_NAMES[id as PlatformId] ?? id).join("、"),
    query ? `“${query}”` : "",
    hideCompleted ? "隐藏已完成" : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const searchRef = useRef<HTMLInputElement>(null);
  const clearToolbarFilters = () => {
    setPlatforms([]);
    setKeyword("");
    setQuery("");
    changeHideCompleted(false);
    setPage(1);
    // 清除后按钮变为禁用，焦点会丢失；移到搜索框，便于继续输入
    searchRef.current?.focus();
  };
  const changeHideCompleted = (value: boolean) => {
    setHideCompleted(value);
    setPage(1);
    try {
      window.localStorage.setItem(HIDE_COMPLETED_KEY, value ? "1" : "0");
    } catch {
      // 本机存储不可用时仅本次生效。
    }
  };
  const run = async (key: string, action: () => Promise<void>) => {
    if (busy) {
      return;
    }
    setBusy(key);
    try {
      await action();
    } finally {
      setBusy(null);
      refresh();
    }
  };
  const retry = (row: DistributionTaskRow) =>
    run(row.targetId, async () => {
      try {
        await submitDistribution(row.contentId, row.targetId);
        toast.add({ type: "success", title: "已重新加入分发队列" });
      } catch {
        toast.add({
          type: "error",
          title: "未能重新发布，请检查作品和账号后重试",
        });
      }
    });
  const retryAll = (rows: DistributionTaskRow[]) =>
    run(rows[0].contentId, async () => {
      try {
        const outcome = await retryDistributions(
          rows.map((row) => ({
            contentId: row.contentId,
            targetId: row.targetId,
          })),
        );
        toast.add(
          outcome.failed.length === 0
            ? {
                type: "success",
                title: `已重新加入分发队列 ${outcome.queued.length} 个账号`,
              }
            : {
                type: "error",
                title: `${outcome.queued.length} 个已加入队列，${outcome.failed.length} 个未能加入，请检查作品和账号`,
              },
        );
      } catch (reason) {
        toast.add({
          type: "error",
          title: reason instanceof Error ? reason.message : "未能全部重试",
        });
      }
    });
  const cancel = (row: DistributionTaskRow) =>
    run(row.targetId, async () => {
      try {
        await cancelDistribution({
          contentId: row.contentId,
          targetId: row.targetId,
        });
        toast.add({ type: "success", title: "已取消该账号的发布" });
      } catch (reason) {
        toast.add({
          type: "error",
          title:
            reason instanceof Error ? reason.message : "未能取消，请稍后重试",
        });
      }
    });
  const confirmPublished = (row: DistributionTaskRow) =>
    run(row.targetId, async () => {
      try {
        await confirmDistributionPublished(row.contentId, row.targetId);
        toast.add({ type: "success", title: "已标记为发布成功" });
      } catch {
        toast.add({ type: "error", title: "未能标记，请稍后重试" });
      }
    });

  const subject = `${platforms.length === 1 ? (PLATFORM_NAMES[platforms[0] as PlatformId] ?? "") + "的" : ""}${
    type === "all" ? "作品" : DISTRIBUTION_TYPES[type].label
  }`;
  const searchInput = (
    <>
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
      <InputGroupInput
        ref={searchRef}
        value={keyword}
        onChange={(event) => {
          setKeyword(event.target.value);
          setPage(1);
        }}
        placeholder="搜索作品标题或账号"
        aria-label="搜索作品标题或账号"
      />
      {keyword ? (
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            aria-label="清除搜索"
            onClick={() => {
              setKeyword("");
              setPage(1);
            }}
          >
            <X />
          </InputGroupButton>
        </InputGroupAddon>
      ) : null}
    </>
  );

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-3">
      <StickyPageHeader className="gap-4 pb-3 md:pb-3">
        <PageHeader
          title="分发队列"
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={refresh}
              disabled={loading}
              aria-label="刷新分发队列"
            >
              {loading ? (
                <Spinner aria-hidden data-icon="inline-start" />
              ) : (
                <RefreshCw data-icon="inline-start" />
              )}
              刷新
            </Button>
          }
        />
        {/* 两行：类型与「隐藏已完成」一行，搜索与筛选一行，各行不换行 */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-nowrap items-center justify-between gap-3">
            <Tabs
              value={type}
              onValueChange={(value) => {
                setType(value as DistributionTypeFilter);
                setPage(1);
              }}
              className="shrink-0"
            >
              <TabsList aria-label="作品类型" className="h-9">
                <TabsTrigger value="all" className="gap-2 px-3">
                  全部
                  <Badge
                    variant="secondary"
                    className="min-w-7 justify-center tabular-nums"
                  >
                    {result?.typeCounts.all ?? "—"}
                  </Badge>
                </TabsTrigger>
                {typeOrder.map((value) => {
                  const meta = DISTRIBUTION_TYPES[value];
                  const Icon = meta.icon;
                  return (
                    <TabsTrigger
                      key={value}
                      value={value}
                      className="gap-2 px-3"
                    >
                      <Icon aria-hidden />
                      {meta.label}
                      <Badge
                        variant="secondary"
                        className="min-w-7 justify-center tabular-nums"
                      >
                        {result?.typeCounts[value] ?? "—"}
                      </Badge>
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </Tabs>
            <div className="flex h-9 shrink-0 items-center gap-2">
              <Switch
                id="distribution-hide-completed"
                checked={hideCompleted}
                onCheckedChange={(checked) =>
                  changeHideCompleted(Boolean(checked))
                }
              />
              <Label
                htmlFor="distribution-hide-completed"
                className="whitespace-nowrap"
              >
                隐藏已完成
              </Label>
            </div>
          </div>
          <div className="flex flex-nowrap items-center gap-2">
            <InputGroup className="h-9 min-w-0 flex-1">
              {searchInput}
            </InputGroup>
            <DistributionPlatformFilter
              value={platforms}
              onChange={(value) => {
                setPlatforms(value);
                setPage(1);
              }}
            />
            {/* 始终占位，无筛选时禁用，避免出现/消失引起工具栏跳动 */}
            <Button
              variant="ghost"
              className="h-9 shrink-0"
              disabled={!toolbarFiltered}
              onClick={clearToolbarFilters}
            >
              清除全部
            </Button>
          </div>
        </div>
      </StickyPageHeader>
      {hasError ? (
        <Alert>
          <AlertCircle />
          <AlertDescription>
            {state.error || error}。
            {result ? "当前显示上次读取的状态。" : "暂时无法读取任务状态。"}
          </AlertDescription>
        </Alert>
      ) : null}
      {/* 刷新时保留旧结果，只降低不透明度提示加载中，不清空、不改变布局 */}
      <div
        className={cn(
          "flex flex-col gap-3 transition-opacity",
          loading && result ? "opacity-60" : "",
        )}
        aria-busy={loading}
      >
        {grouped.length > 0 ? (
          grouped.map((rows) => (
            <DistributionWorkCard
              key={rows[0].contentId}
              rows={rows}
              tasks={tasks}
              now={now}
              busy={busy}
              onRetry={(row) => void retry(row)}
              onRetryAll={(rows) => void retryAll(rows)}
              onCancel={(row) => void cancel(row)}
              onConfirmPublished={(row) => void confirmPublished(row)}
            />
          ))
        ) : loading && !result ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
          <Empty className="min-h-72 rounded-lg border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                {hasError ? (
                  <AlertCircle />
                ) : noMatch ? (
                  <SearchX className="text-muted-foreground" />
                ) : (
                  <CheckCircle2 />
                )}
              </EmptyMedia>
              <EmptyTitle>
                {hasError
                  ? "暂时无法读取任务状态"
                  : typeOnly
                    ? `“${DISTRIBUTION_TYPES[type as DistributionContentType].label}”下暂无发布记录`
                    : hideOnly
                      ? `${subject}都发完了`
                      : noMatch
                        ? "没有找到符合条件的作品"
                        : "还没有分发任务"}
              </EmptyTitle>
              <EmptyDescription>
                {hasError ? (
                  "请稍后刷新，已有任务会继续执行。"
                ) : typeOnly ? (
                  `还没有“${DISTRIBUTION_TYPES[type as DistributionContentType].label}”类的发布记录，可以切到“全部”看看其他类型。`
                ) : hideOnly ? (
                  "已隐藏已完成的作品。"
                ) : noMatch ? (
                  <>
                    <span className="block">当前筛选：{filterSummary}</span>
                    <span className="block">换个关键词或清除筛选看看。</span>
                  </>
                ) : (
                  "提交作品后，可在这里跟踪各账号的发布进度。"
                )}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="flex-row justify-center gap-2">
              {hasError ? (
                <Button variant="outline" onClick={refresh}>
                  重新读取
                </Button>
              ) : (
                <>
                  {toolbarFiltered ? (
                    hideCompleted &&
                    platforms.length === 0 &&
                    keyword.trim() === "" ? (
                      <Button
                        variant="outline"
                        onClick={() => changeHideCompleted(false)}
                      >
                        显示已完成
                      </Button>
                    ) : (
                      <Button variant="outline" onClick={clearToolbarFilters}>
                        清除全部
                      </Button>
                    )
                  ) : type !== "all" ? (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setType("all");
                        setPage(1);
                      }}
                    >
                      查看全部类型
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      nativeButton={false}
                      role="link"
                      render={<Link to="/contents" />}
                    >
                      作品管理
                    </Button>
                  )}
                </>
              )}
            </EmptyContent>
          </Empty>
        )}
      </div>
      {pageCount > 1 ? (
        <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
          <span className="tabular-nums">
            第 {page} / {pageCount} 页
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={loading || page === 1}
            onClick={() => setPage(page - 1)}
          >
            上一页
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={loading || page >= pageCount}
            onClick={() => setPage(page + 1)}
          >
            下一页
          </Button>
        </div>
      ) : null}
    </div>
  );
}
