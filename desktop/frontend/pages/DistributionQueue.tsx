import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  CirclePlay,
  RefreshCw,
} from "lucide-react";
import type {
  DistributionPage,
  DistributionTaskRow,
  DistributionView,
} from "@shared/distribution";
import { useDistributionState } from "@/components/publishing/DistributionProvider";
import { PageHeader } from "@/components/layouts/PageHeader";
import { StickyPageHeader } from "@/components/layouts/StickyPageHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { fetchDistributionPage } from "@/lib/api";
import { DistributionWorkRows } from "@/components/publishing/DistributionWorkRows";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Spinner } from "@/components/ui/spinner";
import { submitDistribution } from "@/lib/distribution";
import { toast } from "@/lib/app-toast";

const views: Array<{ value: DistributionView; label: string; empty: string }> =
  [
    { value: "active", label: "正在发布", empty: "当前没有正在发布的任务" },
    { value: "waiting", label: "等待中", empty: "当前没有等待中的任务" },
    { value: "attention", label: "需要处理", empty: "暂无需要处理的任务" },
    {
      value: "completed",
      label: "近期完成",
      empty: "最近 24 小时没有完成的任务",
    },
  ];
const viewIcons = {
  active: CirclePlay,
  waiting: Clock3,
  attention: AlertCircle,
  completed: CheckCircle2,
};
const emptyDescriptions = {
  active: "提交作品后，可在这里跟踪各平台的发布进度。",
  waiting: "暂无排队任务，新任务会自动安排发布。",
  attention: "遇到发布问题时，可在这里查看原因并处理。",
  completed: "发布成功的账号任务会保留在这里 24 小时。",
};

export default function DistributionQueue() {
  const state = useDistributionState();
  const [view, setView] = useState<DistributionView>("active");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<DistributionPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<DistributionTaskRow | null>(
    null,
  );
  const [now, setNow] = useState(Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const refreshPage = useRef<() => void>(() => undefined);
  const [reload, setReload] = useState(0);
  const activeFirstPage = view === "active" && page === 1;
  useEffect(() => {
    if (activeFirstPage) {
      refreshPage.current = () => undefined;
      return;
    }
    let alive = true;
    let fetching = false;
    const load = async () => {
      if (fetching) {
        return;
      }
      fetching = true;
      setLoading(true);
      try {
        const data = await fetchDistributionPage(view, page);
        if (alive) {
          setResult(data);
          setError("");
          const lastPage = Math.max(1, Math.ceil(data.total / data.pageSize));
          if (page > lastPage) {
            setPage(lastPage);
          }
        }
      } catch {
        if (alive) {
          setError("分发任务更新失败，请重试");
        }
      } finally {
        fetching = false;
        if (alive) {
          setLoading(false);
        }
      }
    };
    refreshPage.current = () => {
      void load();
    };
    void load();
    return () => {
      alive = false;
      refreshPage.current = () => undefined;
    };
  }, [view, page, activeFirstPage]);
  useEffect(() => {
    refreshPage.current();
  }, [state.version, reload]);
  useEffect(() => {
    setRefreshing(false);
  }, [state.version]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(timer);
    };
  }, []);
  const data = activeFirstPage ? state.activePage : result;
  const pending = activeFirstPage ? state.loading : loading;
  const counts = state.activePage.counts;
  const refresh = () => {
    setRefreshing(true);
    state.refresh();
    setReload((value) => value + 1);
  };
  const retry = async (row: DistributionTaskRow) => {
    if (busy) {
      return;
    }
    setBusy(row.targetId);
    try {
      await submitDistribution(row.contentId, row.targetId);
      toast.add({ type: "success", title: "已加入分发队列" });
      refresh();
    } catch {
      toast.add({
        type: "error",
        title: "未能重新发布，请检查作品和账号后重试",
      });
    } finally {
      setBusy(null);
    }
  };
  const grouped = new Map<string, DistributionTaskRow[]>();
  for (const item of data?.items ?? []) {
    const rows = grouped.get(item.contentId) ?? [];
    rows.push(item);
    grouped.set(item.contentId, rows);
  }
  const selected = views.find((item) => item.value === view)!;
  const emptyAlternative =
    view === "active" && state.hasRead && counts.waiting > 0
      ? "waiting"
      : view === "active" && state.hasRead && counts.attention > 0
        ? "attention"
        : null;
  const hasError = Boolean(state.error || error);
  const EmptyIcon = hasError ? AlertCircle : viewIcons[view];
  const changeView = (value: DistributionView) => {
    setView(value);
    setPage(1);
    setResult(null);
    setError("");
  };
  const changePage = (value: number) => {
    setResult(null);
    setPage(value);
  };
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col">
      <Tabs
        value={view}
        onValueChange={(value) => changeView(value as DistributionView)}
      >
        <StickyPageHeader className="gap-3 pb-2 md:pb-2">
          <PageHeader
            title="分发队列"
            action={
              <>
                <div className="hidden items-center gap-4 text-xs text-muted-foreground md:flex">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock3 className="size-3.5" aria-hidden />
                    {hasError ? "状态更新暂不可用" : "自动更新"}
                  </span>
                  <Link
                    to="/preferences"
                    className="underline-offset-4 hover:text-foreground hover:underline"
                    title="调整同时分发数量"
                  >
                    同时分发 {state.snapshot?.concurrency ?? "—"} 个账号
                  </Link>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={refresh}
                  disabled={refreshing || pending}
                  aria-label="刷新分发队列"
                >
                  {refreshing || pending ? (
                    <Spinner aria-hidden data-icon="inline-start" />
                  ) : (
                    <RefreshCw data-icon="inline-start" />
                  )}
                  刷新
                </Button>
              </>
            }
          />
          <div className="max-w-full overflow-x-auto pb-2">
            <TabsList aria-label="分发状态">
              {views.map((item) => (
                <TabsTrigger
                  key={item.value}
                  value={item.value}
                  aria-label={`${item.label}，${state.hasRead ? `${counts[item.value]} 项任务` : "状态待更新"}`}
                  className="gap-2 px-3"
                >
                  {item.label}
                  <Badge variant="secondary">
                    {state.hasRead ? counts[item.value] : "—"}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </StickyPageHeader>
        {hasError ? (
          <Alert className="my-2">
            <AlertCircle />
            <AlertDescription>
              {state.error || error}。
              {state.hasRead
                ? "当前显示上次读取的状态。"
                : "暂时无法读取任务状态。"}
            </AlertDescription>
          </Alert>
        ) : null}
        <TabsContent
          value={view}
          className="mt-1 flex min-w-0 flex-col gap-3"
          aria-busy={pending}
        >
          <div className="overflow-hidden rounded-lg border">
            <Table className="min-w-[42rem] table-fixed" aria-label="分发任务">
              <colgroup>
                <col className="w-[24%]" />
                <col />
                <col className="w-32" />
                <col className="w-52" />
              </colgroup>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col" className="pl-4">
                    平台账号
                  </TableHead>
                  <TableHead scope="col">发布状态</TableHead>
                  <TableHead scope="col">耗时 / 时间</TableHead>
                  <TableHead scope="col" className="pr-4 text-right">
                    操作
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.items.length ? (
                  [...grouped].map(([id, rows]) => (
                    <DistributionWorkRows
                      key={id}
                      rows={rows}
                      tasks={state.snapshot?.tasks ?? []}
                      now={now}
                      busy={busy}
                      onRetry={(row) => {
                        if (row.errorCode === "PUBLISH_RESULT_UNKNOWN") {
                          setConfirmation(row);
                        } else {
                          void retry(row);
                        }
                      }}
                    />
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="p-0">
                      {pending ? (
                        <div className="flex flex-col gap-3 p-4">
                          <Skeleton className="h-12 w-full" />
                          <Skeleton className="h-12 w-full" />
                        </div>
                      ) : (
                        <Empty className="min-h-52 py-8">
                          <EmptyHeader>
                            <EmptyMedia variant="icon">
                              <EmptyIcon />
                            </EmptyMedia>
                            <EmptyTitle>
                              {hasError
                                ? "暂时无法读取任务状态"
                                : selected.empty}
                            </EmptyTitle>
                            <EmptyDescription>
                              {hasError
                                ? "请稍后刷新，已有任务会继续执行。"
                                : emptyDescriptions[view]}
                            </EmptyDescription>
                          </EmptyHeader>
                          {hasError ? (
                            <Button
                              variant="outline"
                              onClick={refresh}
                              disabled={refreshing || pending}
                            >
                              重新读取
                            </Button>
                          ) : emptyAlternative ? (
                            <Button
                              variant="outline"
                              onClick={() => changeView(emptyAlternative)}
                            >
                              {emptyAlternative === "waiting"
                                ? "查看等待任务"
                                : "查看待处理任务"}
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
                        </Empty>
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <p>
              {view === "completed"
                ? "最近 24 小时的成功结果，发布结果以平台审核为准。"
                : "任务按作品分组，发布进度自动更新。"}
            </p>
            {data && state.hasRead ? (
              <span className="tabular-nums">
                共 {data.total} 项任务
                {data.total > data.pageSize
                  ? ` · 第 ${page} / ${Math.ceil(data.total / data.pageSize)} 页`
                  : ""}
              </span>
            ) : null}
          </div>
          {data && data.total > data.pageSize ? (
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pending || page === 1}
                onClick={() => changePage(page - 1)}
              >
                上一页
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pending || page * data.pageSize >= data.total}
                onClick={() => changePage(page + 1)}
              >
                下一页
              </Button>
            </div>
          ) : null}
        </TabsContent>
      </Tabs>
      <AlertDialog
        open={Boolean(confirmation)}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmation(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>已核对平台上的发布结果？</AlertDialogTitle>
            <AlertDialogDescription>
              上一次提交的结果尚未确认。请先到平台查看，确认没有发布成功后再重新发布，避免重复创建作品。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmation) {
                  void retry(confirmation);
                }
              }}
            >
              确认重新发布
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
