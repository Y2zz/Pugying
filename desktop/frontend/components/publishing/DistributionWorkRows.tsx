import { Link } from "react-router-dom";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ExternalLink,
  Link2,
  RotateCcw,
} from "lucide-react";
import type {
  DistributionLiveTask,
  DistributionTaskRow,
} from "@shared/distribution";
import { PlatformIcon } from "@/components/PlatformIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { Spinner } from "@/components/ui/spinner";
import { PLATFORM_NAMES, safePlatformUrl } from "@/lib/content-management";
import {
  distributionElapsed,
  distributionTaskStatus,
  distributionTime,
} from "@/lib/distribution-view";
import type { PlatformId } from "@/lib/api";

const types = { article: "文章", graphic: "图文", video: "视频" };

function taskPresentation(
  row: DistributionTaskRow,
  live?: DistributionLiveTask,
) {
  const status = live
    ? live.state === "waiting"
      ? "queued"
      : "running"
    : row.publishStatus;
  const unknown =
    status === "failed" && row.errorCode === "PUBLISH_RESULT_UNKNOWN";
  return {
    status,
    label:
      live?.state === "saving"
        ? "保存结果中"
        : unknown
          ? "结果待确认"
          : {
              queued: "排队中",
              running: "发布中",
              succeeded: "发布成功",
              failed: "发布失败",
              cancelled: "已取消",
            }[status],
    tone:
      status === "failed" && !unknown
        ? ("destructive" as const)
        : status === "queued" || status === "cancelled" || unknown
          ? ("outline" as const)
          : ("secondary" as const),
  };
}

export function DistributionWorkRows({
  rows,
  tasks,
  now,
  busy,
  onRetry,
}: {
  rows: DistributionTaskRow[];
  tasks: DistributionLiveTask[];
  now: number;
  busy: string | null;
  onRetry: (row: DistributionTaskRow) => void;
}) {
  const work = rows[0];
  const hasActiveWork = tasks.some((task) => task.contentId === work.contentId);
  return (
    <>
      <TableRow aria-label={work.title}>
        <TableCell colSpan={4} className="px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <div className="flex min-w-0 items-center gap-2">
                <Badge variant="outline">{types[work.type]}</Badge>
                <h2 className="truncate font-medium" title={work.title}>
                  {work.title}
                </h2>
              </div>
              <span className="text-xs text-muted-foreground">
                已处理 {work.processedCount} / {work.taskCount} 个账号
              </span>
              {rows.length < work.taskCount ? (
                <span className="text-xs text-muted-foreground">
                  当前显示 {rows.length} 个账号
                </span>
              ) : null}
            </div>
            <Button
              size="xs"
              variant="ghost"
              nativeButton={false}
              role="link"
              render={<Link to={`/contents?contentId=${work.contentId}`} />}
            >
              查看作品
              <ChevronRight data-icon="inline-end" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {rows.map((row) => {
        const live = tasks.find((task) => task.targetId === row.targetId);
        const { status, label, tone } = taskPresentation(row, live);
        const message = distributionTaskStatus(row, live);
        const url = safePlatformUrl(row.platformUrl);
        const platform = row.platform as PlatformId;
        const needsAuthorization =
          row.errorCode === "AUTH_EXPIRED" && status === "failed";
        const needsMedia =
          ["MEDIA_MISSING", "MEDIA_UNREACHABLE"].includes(
            row.errorCode ?? "",
          ) && status === "failed";
        const canRetry =
          (status === "failed" || status === "cancelled") &&
          row.accountAvailable;
        const date =
          status === "succeeded" ||
          status === "failed" ||
          status === "cancelled"
            ? row.finishedAt
            : status === "queued"
              ? live?.queuedAt || row.updatedAt
              : (live?.startedAt ?? row.startedAt);
        return (
          <TableRow
            key={row.targetId}
            aria-label={`${row.accountName} · ${label}`}
          >
            <TableCell className="py-3 pl-4">
              <div className="flex min-w-0 items-center gap-2.5">
                {platform in PLATFORM_NAMES ? (
                  <PlatformIcon platform={platform} alt="" className="size-6" />
                ) : (
                  <Link2 className="size-6 shrink-0" aria-hidden />
                )}
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="truncate font-medium" title={row.accountName}>
                    {row.accountName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {PLATFORM_NAMES[platform] ?? "发布平台"}
                  </p>
                </div>
              </div>
            </TableCell>
            <TableCell className="whitespace-normal py-3">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Badge variant={tone}>
                  {status === "running" ? (
                    <Spinner aria-hidden data-icon="inline-start" />
                  ) : status === "succeeded" ? (
                    <CheckCircle2 aria-hidden data-icon="inline-start" />
                  ) : status === "failed" ? (
                    <AlertCircle aria-hidden data-icon="inline-start" />
                  ) : (
                    <Clock3 aria-hidden data-icon="inline-start" />
                  )}
                  {label}
                </Badge>
                {message !== label ? (
                  <p className="break-words text-xs text-muted-foreground">
                    {message}
                  </p>
                ) : null}
                {canRetry && hasActiveWork ? (
                  <p className="text-xs text-muted-foreground">
                    其余账号仍在分发，完成后可重试
                  </p>
                ) : null}
              </div>
            </TableCell>
            <TableCell className="py-3">
              <div className="flex flex-col gap-1 tabular-nums">
                <span>
                  {status === "queued" ? "已等待" : "耗时"}{" "}
                  {distributionElapsed(row, live, now)}
                </span>
                {date ? (
                  <time
                    dateTime={date}
                    className="text-xs text-muted-foreground"
                    title={`${status === "running" ? "开始于" : status === "queued" ? "加入于" : "完成于"} ${new Date(date).toLocaleString("zh-CN")}`}
                  >
                    {distributionTime(date, now)}
                  </time>
                ) : null}
              </div>
            </TableCell>
            <TableCell className="py-3 pr-4">
              <div className="flex flex-wrap items-center justify-end gap-1">
                {url && status === "succeeded" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    nativeButton={false}
                    role="link"
                    render={<a href={url} target="_blank" rel="noreferrer" />}
                  >
                    <ExternalLink data-icon="inline-start" />
                    平台作品
                  </Button>
                ) : null}
                {!row.accountAvailable ? (
                  <Button
                    size="sm"
                    variant="outline"
                    nativeButton={false}
                    role="link"
                    render={<Link to="/platform-accounts" />}
                  >
                    管理账号
                  </Button>
                ) : needsAuthorization ? (
                  <Button
                    size="sm"
                    variant="outline"
                    nativeButton={false}
                    role="link"
                    render={<Link to="/platform-accounts" />}
                  >
                    重新授权
                  </Button>
                ) : null}
                {needsMedia && !hasActiveWork ? (
                  <Button
                    size="sm"
                    variant="outline"
                    nativeButton={false}
                    role="link"
                    render={
                      <Link to={`/publish/${row.type}?id=${row.contentId}`} />
                    }
                  >
                    重新选择素材
                  </Button>
                ) : null}
                {canRetry ? (
                  <Button
                    size="sm"
                    variant={
                      needsAuthorization || needsMedia ? "ghost" : "outline"
                    }
                    disabled={Boolean(busy) || hasActiveWork}
                    onClick={() => onRetry(row)}
                  >
                    {busy === row.targetId ? (
                      <Spinner aria-hidden data-icon="inline-start" />
                    ) : (
                      <RotateCcw data-icon="inline-start" />
                    )}
                    {busy === row.targetId ? "提交中…" : "重新发布"}
                  </Button>
                ) : null}
              </div>
            </TableCell>
          </TableRow>
        );
      })}
    </>
  );
}
