import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  Images,
  Link2,
  RotateCcw,
  Video,
} from "lucide-react";
import type {
  DistributionContentType,
  DistributionLiveTask,
  DistributionTaskRow,
} from "@shared/distribution";
import { PlatformIcon } from "@/components/PlatformIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { PLATFORM_NAMES, safePlatformUrl } from "@/lib/content-management";
import {
  canRetryDistribution,
  distributionElapsed,
  distributionIssue,
  distributionTaskStatus,
  distributionTime,
  isDistributionWorkCompleted,
} from "@/lib/distribution-view";
import type { PlatformId } from "@/lib/api";
import { cn } from "@/lib/utils";

export const DISTRIBUTION_TYPES: Record<
  DistributionContentType,
  { label: string; icon: typeof Video; className: string }
> = {
  video: {
    label: "视频",
    icon: Video,
    className:
      "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
  },
  graphic: {
    label: "图文",
    icon: Images,
    className:
      "bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-950/60 dark:text-fuchsia-300",
  },
  article: {
    label: "文章",
    icon: FileText,
    className:
      "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  },
};

export function DistributionTypeBadge({
  type,
}: {
  type: DistributionContentType;
}) {
  const meta = DISTRIBUTION_TYPES[type];
  const Icon = meta.icon;
  return (
    <Badge className={meta.className}>
      <Icon aria-hidden data-icon="inline-start" />
      {meta.label}
    </Badge>
  );
}

export interface DistributionWorkActions {
  busy: string | null;
  onRetry: (row: DistributionTaskRow) => void;
  onRetryAll: (rows: DistributionTaskRow[]) => void;
  onCancel: (row: DistributionTaskRow) => void;
  onConfirmPublished: (row: DistributionTaskRow) => void;
}

function PlatformMark({
  platform,
  className,
}: {
  platform: string;
  className?: string;
}) {
  return platform in PLATFORM_NAMES ? (
    <PlatformIcon
      platform={platform as PlatformId}
      alt=""
      className={className}
    />
  ) : (
    <Link2 className={cn("shrink-0", className)} aria-hidden />
  );
}

/** 一个作品一张卡片；状态只体现在账号行上，作品顺序由服务端按紧急程度给出。 */
export function DistributionWorkCard({
  rows,
  tasks,
  now,
  ...actions
}: {
  rows: DistributionTaskRow[];
  tasks: DistributionLiveTask[];
  now: number;
} & DistributionWorkActions) {
  const work = rows[0];
  const completed = isDistributionWorkCompleted(rows, tasks);
  const [expanded, setExpanded] = useState(false);
  if (completed) {
    const finished = rows
      .map((row) => row.finishedAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1);
    return (
      <section
        aria-label={work.title}
        className="overflow-hidden rounded-lg border bg-card"
      >
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-muted/50"
        >
          <DistributionTypeBadge type={work.type} />
          <span className="min-w-0 truncate font-medium" title={work.title}>
            {work.title}
          </span>
          <span className="flex-1" />
          <span
            className="flex shrink-0 items-center gap-2"
            aria-label={`${rows.length} 个账号已发布`}
          >
            {rows.map((row) => (
              <span key={row.targetId} className="flex items-center">
                <PlatformMark platform={row.platform} className="size-5" />
                <Check
                  className="size-3 text-emerald-600 dark:text-emerald-400"
                  aria-hidden
                />
              </span>
            ))}
          </span>
          {finished ? (
            <time
              dateTime={finished}
              className="w-24 shrink-0 text-right text-muted-foreground tabular-nums"
            >
              {distributionTime(finished, now)}
            </time>
          ) : null}
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground",
              expanded && "rotate-180",
            )}
            aria-hidden
          />
        </button>
        {expanded
          ? rows.map((row) => (
              <AccountRow key={row.targetId} row={row} now={now} {...actions} />
            ))
          : null}
      </section>
    );
  }
  const retryable = rows.filter(
    (row) =>
      canRetryDistribution(row) &&
      !tasks.some((task) => task.targetId === row.targetId),
  );
  return (
    <section
      aria-label={work.title}
      className="overflow-hidden rounded-lg border bg-card"
    >
      <header className="flex items-center gap-3 px-4 py-3">
        <DistributionTypeBadge type={work.type} />
        <h2 className="min-w-0 truncate font-medium" title={work.title}>
          {work.title}
        </h2>
        <span className="flex-1" />
        {retryable.length >= 2 ? (
          <Button
            size="sm"
            variant="outline"
            disabled={Boolean(actions.busy)}
            onClick={() => actions.onRetryAll(retryable)}
          >
            {actions.busy === work.contentId ? (
              <Spinner aria-hidden data-icon="inline-start" />
            ) : (
              <RotateCcw data-icon="inline-start" />
            )}
            全部重试（{retryable.length}）
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          nativeButton={false}
          role="link"
          render={<Link to={`/contents?contentId=${work.contentId}`} />}
        >
          查看作品
          <ChevronRight data-icon="inline-end" />
        </Button>
      </header>
      {rows.map((row) => (
        <AccountRow
          key={row.targetId}
          row={row}
          live={tasks.find((task) => task.targetId === row.targetId)}
          now={now}
          {...actions}
        />
      ))}
    </section>
  );
}

function AccountRow({
  row,
  live,
  now,
  busy,
  onRetry,
  onCancel,
  onConfirmPublished,
}: {
  row: DistributionTaskRow;
  live?: DistributionLiveTask;
  now: number;
} & DistributionWorkActions) {
  const [checking, setChecking] = useState(false);
  const issue = live ? null : distributionIssue(row);
  const url = safePlatformUrl(row.platformUrl);
  const platformName = PLATFORM_NAMES[row.platform as PlatformId] ?? "发布平台";
  const pending = busy === row.targetId;
  const queued = live
    ? live.state === "waiting"
    : row.publishStatus === "queued";
  const running = live
    ? live.state !== "waiting"
    : row.publishStatus === "running";
  const percent =
    live?.phase === "uploading" && typeof live.uploadPercent === "number"
      ? live.uploadPercent
      : null;
  const retryButton = (variant: "outline" | "ghost", label = "重试") => (
    <Button
      size={label ? "sm" : "icon-sm"}
      variant={variant}
      disabled={Boolean(busy)}
      aria-label={label ? undefined : "处理好后重试"}
      title={label ? undefined : "处理好后重试"}
      onClick={() => onRetry(row)}
    >
      {pending ? (
        <Spinner aria-hidden data-icon={label ? "inline-start" : undefined} />
      ) : (
        <RotateCcw data-icon={label ? "inline-start" : undefined} />
      )}
      {label}
    </Button>
  );
  const linkButton = (to: string, text: string, primary: boolean) => (
    <Button
      size="sm"
      variant={primary ? "default" : "outline"}
      nativeButton={false}
      role="link"
      render={<Link to={to} />}
    >
      {text}
    </Button>
  );

  let state: ReactNode;
  let action: ReactNode = null;
  let time: ReactNode = null;
  if (running) {
    state =
      percent !== null ? (
        <span className="flex items-center gap-3">
          <span
            className="h-1 w-48 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label="上传进度"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span
              className="block h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${percent}%` }}
            />
          </span>
          <span className="text-sm text-muted-foreground tabular-nums">
            {percent}%
          </span>
        </span>
      ) : (
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner aria-hidden />
          {distributionTaskStatus(row, live)}
        </span>
      );
    time = `已用 ${distributionElapsed(row, live, now)}`;
  } else if (queued) {
    state = <span className="text-sm text-muted-foreground">排队中</span>;
    time = `已等 ${distributionElapsed(row, live, now)}`;
    action = live ? (
      <Button
        size="sm"
        variant="ghost"
        disabled={Boolean(busy)}
        onClick={() => onCancel(row)}
      >
        {pending ? <Spinner aria-hidden data-icon="inline-start" /> : null}
        取消
      </Button>
    ) : null;
  } else if (row.publishStatus === "succeeded") {
    state = (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
        <Check className="size-4" aria-hidden />
        已发布
      </span>
    );
    action = url ? (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline"
      >
        去平台查看
        <ExternalLink className="size-3.5" aria-hidden />
      </a>
    ) : null;
  } else if (issue) {
    const reason = issue.kind === "failed" ? distributionTaskStatus(row) : null;
    state = (
      <span className="flex min-w-0 items-center gap-1.5 text-sm">
        <span
          className={cn(
            "shrink-0 font-medium",
            issue.kind === "unknown"
              ? "text-amber-700 dark:text-amber-400"
              : issue.kind === "cancelled"
                ? "text-muted-foreground"
                : "text-destructive",
          )}
        >
          {issue.label}
        </span>
        {reason ? (
          <span className="truncate text-muted-foreground" title={reason}>
            · {reason}
          </span>
        ) : null}
      </span>
    );
    switch (issue.kind) {
      case "auth":
        action = (
          <>
            {retryButton("ghost", "")}
            {linkButton("/platform-accounts", "重新授权", true)}
          </>
        );
        break;
      case "media":
        action = (
          <>
            {retryButton("ghost", "")}
            {linkButton(
              `/publish/${row.type}?id=${row.contentId}`,
              "重新选择",
              false,
            )}
          </>
        );
        break;
      case "account":
        action = linkButton("/platform-accounts", "管理账号", false);
        break;
      case "unknown":
        action = (
          <Button
            size="sm"
            variant="outline"
            aria-expanded={checking}
            onClick={() => setChecking((value) => !value)}
          >
            {checking ? "收起" : "核对"}
            <ChevronDown
              data-icon="inline-end"
              className={cn(checking && "rotate-180")}
            />
          </Button>
        );
        break;
      default:
        action = retryButton("outline");
    }
  }
  const finished = row.finishedAt;
  return (
    <div
      className="border-t"
      aria-label={`${row.accountName} · ${platformName}`}
    >
      <div className="grid grid-cols-[minmax(0,14rem)_minmax(0,1fr)_8rem_auto] items-center gap-4 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <PlatformMark platform={row.platform} className="size-6" />
          <div className="flex min-w-0 flex-col">
            <p className="truncate text-sm font-medium" title={row.accountName}>
              {row.accountName}
            </p>
            <p className="truncate text-sm text-muted-foreground">
              {platformName}
            </p>
          </div>
        </div>
        <div className="min-w-0">{state}</div>
        <div className="text-sm text-muted-foreground tabular-nums">
          {time ??
            (finished ? (
              <time
                dateTime={finished}
                title={new Date(finished).toLocaleString("zh-CN")}
              >
                {distributionTime(finished, now)}
              </time>
            ) : null)}
        </div>
        <div className="flex items-center justify-end gap-1">{action}</div>
      </div>
      {issue?.kind === "unknown" && checking ? (
        <div className="mx-4 mb-3 flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm sm:ml-[3.25rem] dark:border-amber-900 dark:bg-amber-950/40">
          <p className="font-medium">
            提交后没收到{platformName}的结果，作品可能已经发出去了
          </p>
          <p className="text-muted-foreground">
            请先到{platformName}创作者后台的作品列表看一眼，避免重复发布。
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={Boolean(busy)}
              onClick={() => onConfirmPublished(row)}
            >
              {pending ? (
                <Spinner aria-hidden data-icon="inline-start" />
              ) : (
                <Check data-icon="inline-start" />
              )}
              已经发出去了
            </Button>
            <Button
              size="sm"
              disabled={Boolean(busy)}
              onClick={() => onRetry(row)}
            >
              <RotateCcw data-icon="inline-start" />
              没找到，重新发布
            </Button>
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="ml-auto inline-flex items-center gap-1 underline-offset-4 hover:underline"
              >
                打开{platformName}
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
