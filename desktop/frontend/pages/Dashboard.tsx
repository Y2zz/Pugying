import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronDown,
  Clapperboard,
  FileText,
  Images,
  LayoutGrid,
  Link2,
  ListOrdered,
  Plus,
} from "lucide-react";
import type { DistributionTaskRow } from "@shared/distribution";
import { PageHeader } from "@/components/layouts/PageHeader";
import { PlatformIcon } from "@/components/PlatformIcon";
import { useDistributionState } from "@/components/publishing/DistributionProvider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchContents,
  fetchDistributionPage,
  fetchPlatformAccounts,
  type PlatformId,
} from "@/lib/api";
import { PLATFORM_NAMES } from "@/lib/content-management";
import { distributionTaskStatus } from "@/lib/distribution-view";
import { cn } from "@/lib/utils";

type LoadState = "loading" | "ready" | "error";

function StatCard({
  label,
  value,
  hint,
  to,
  loading,
}: {
  label: string;
  value: string;
  hint: string;
  to: string;
  loading: boolean;
}) {
  return (
    <Link to={to} className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Card size="sm" className="h-full transition-colors hover:bg-accent/40">
        <CardHeader>
          <CardDescription>{label}</CardDescription>
          <CardTitle className="font-heading text-2xl font-semibold tracking-tight">
            {loading ? <Skeleton className="h-8 w-12" /> : value}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{hint}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

export function Dashboard() {
  const distribution = useDistributionState();
  const counts = distribution.activePage.counts;
  const inProgress = counts.active + counts.waiting;
  const attention = counts.attention;

  const [contentTotal, setContentTotal] = useState<number | null>(null);
  const [accountTotal, setAccountTotal] = useState<number | null>(null);
  const [statsState, setStatsState] = useState<LoadState>("loading");
  const [recent, setRecent] = useState<DistributionTaskRow[]>([]);
  const [recentState, setRecentState] = useState<LoadState>("loading");

  useEffect(() => {
    let alive = true;
    setStatsState("loading");
    Promise.all([
      fetchContents({ page: 1, pageSize: 1 }),
      fetchPlatformAccounts(),
    ])
      .then(([contents, accounts]) => {
        if (!alive) {
          return;
        }
        setContentTotal(contents.total);
        setAccountTotal(accounts.length);
        setStatsState("ready");
      })
      .catch(() => {
        if (alive) {
          setContentTotal(null);
          setAccountTotal(null);
          setStatsState("error");
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    setRecentState("loading");
    fetchDistributionPage("all", 1, {}, 5)
      .then((page) => {
        if (!alive) {
          return;
        }
        setRecent(page.items);
        setRecentState("ready");
      })
      .catch(() => {
        if (alive) {
          setRecent([]);
          setRecentState("error");
        }
      });
    return () => {
      alive = false;
    };
  }, [distribution.version]);

  const statsLoading = statsState === "loading";
  const queueLoading = !distribution.hasRead && distribution.loading;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="概览" description="本机内容发布工作台。" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="作品"
          value={contentTotal === null ? "—" : String(contentTotal)}
          hint="在作品管理中查看和编辑"
          to="/contents"
          loading={statsLoading}
        />
        <StatCard
          label="账号"
          value={accountTotal === null ? "—" : String(accountTotal)}
          hint="在媒体账号中管理绑定"
          to="/platform-accounts"
          loading={statsLoading}
        />
        <StatCard
          label="进行中"
          value={queueLoading ? "—" : String(inProgress)}
          hint="正在发布或排队等待"
          to="/distribution"
          loading={queueLoading}
        />
        <StatCard
          label="待处理"
          value={queueLoading ? "—" : String(attention)}
          hint="需要确认或重试的任务"
          to="/distribution"
          loading={queueLoading}
        />
      </div>

      {statsState === "error" ? (
        <p className="text-sm text-muted-foreground">
          暂时无法读取作品与账号，请稍后重试
        </p>
      ) : null}

      <Card size="sm">
        <CardHeader>
          <CardTitle>快捷入口</CardTitle>
          <CardDescription>常用操作一键到达</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="default" className="gap-1.5" />}
              >
                <Plus data-icon="inline-start" />
                去发布
                <ChevronDown data-icon="inline-end" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-44">
                <DropdownMenuGroup>
                  <DropdownMenuItem render={<Link to="/publish/article" />}>
                    <FileText />
                    发布文章
                  </DropdownMenuItem>
                  <DropdownMenuItem render={<Link to="/publish/graphic" />}>
                    <Images />
                    发布图文
                  </DropdownMenuItem>
                  <DropdownMenuItem render={<Link to="/publish/video" />}>
                    <Clapperboard />
                    发布视频
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link to="/contents" />}
              className="gap-1.5"
            >
              <LayoutGrid data-icon="inline-start" />
              作品
            </Button>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link to="/platform-accounts" />}
              className="gap-1.5"
            >
              <Link2 data-icon="inline-start" />
              账号
            </Button>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link to="/distribution" />}
              className="gap-1.5"
            >
              <ListOrdered data-icon="inline-start" />
              队列
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader className="border-b">
          <CardTitle>近期分发</CardTitle>
          <CardDescription>最近的账号发布任务</CardDescription>
          <CardAction>
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<Link to="/distribution" />}
            >
              查看全部
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="px-0">
          {recentState === "loading" ? (
            <div className="flex flex-col gap-3 px-4 py-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-3/4" />
            </div>
          ) : recentState === "error" ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              暂时无法读取分发任务，请稍后重试
            </p>
          ) : recent.length === 0 ? (
            <Empty className="min-h-40 border-0 py-8">
              <EmptyHeader>
                <EmptyTitle>还没有分发任务</EmptyTitle>
                <EmptyDescription>
                  发布作品后，可在这里查看最近进度。
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="flex flex-col">
              {recent.map((row) => {
                const live = distribution.snapshot?.tasks.find(
                  (task) => task.targetId === row.targetId,
                );
                const status = distributionTaskStatus(row, live);
                return (
                  <li key={row.targetId}>
                    <Link
                      to="/distribution"
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 outline-none transition-colors",
                        "hover:bg-accent/40 focus-visible:bg-accent/40",
                      )}
                    >
                      <PlatformIcon
                        platform={row.platform as PlatformId}
                        alt=""
                        className="size-4 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{row.title}</div>
                        <div className="truncate text-sm text-muted-foreground">
                          {PLATFORM_NAMES[row.platform as PlatformId] ??
                            row.platform}{" "}
                          · {row.accountName}
                        </div>
                      </div>
                      <span className="max-w-40 shrink-0 truncate text-sm text-muted-foreground">
                        {status}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default Dashboard;
