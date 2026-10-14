import type {
  DistributionLiveTask,
  DistributionTaskRow,
} from "@shared/distribution";
import { describePublishPhase } from "./publish-errors";
import { contentTargetMessage } from "./content-management";

/** 分发队列上传速度文案（与选片预览 formatTransferRate 同刻度） */
function formatUploadSpeed(bps: number): string {
  if (!Number.isFinite(bps) || bps <= 0) {
    return "";
  }
  if (bps < 1024 * 1024) {
    return `${(bps / 1024).toFixed(1)} KB/s`;
  }
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
}

export function distributionTaskStatus(
  row: DistributionTaskRow,
  live?: DistributionLiveTask,
): string {
  if (live?.state === "saving") {
    return "正在保存结果";
  }
  if (live?.state === "waiting") {
    return live.waitingReason === "account"
      ? "等待该账号的上一项任务"
      : "等待空闲位置";
  }
  if (live?.state === "running") {
    const phase = describePublishPhase(live.phase ?? "accepted");
    if (
      live.phase === "uploading" &&
      typeof live.uploadPercent === "number" &&
      Number.isFinite(live.uploadPercent)
    ) {
      const percent = Math.min(100, Math.max(0, Math.floor(live.uploadPercent)));
      const speed =
        typeof live.uploadSpeedBps === "number" && live.uploadSpeedBps > 0
          ? formatUploadSpeed(live.uploadSpeedBps)
          : null;
      return speed
        ? `${phase} ${percent}% · ${speed}`
        : `${phase} ${percent}%`;
    }
    return phase;
  }
  switch (row.publishStatus) {
    case "queued":
      return "排队中";
    case "running":
      return "发布中";
    case "succeeded":
      return "发布成功";
    case "cancelled":
      return "已取消";
    case "failed":
      return contentTargetMessage(row);
  }
}
export function distributionElapsed(
  row: DistributionTaskRow,
  live: DistributionLiveTask | undefined,
  now: number,
): string {
  const waiting =
    live?.state === "waiting" || (!live && row.publishStatus === "queued");
  const start = waiting
    ? live?.queuedAt || row.updatedAt
    : (live?.startedAt ?? row.startedAt);
  if (!start) {
    return "尚未开始";
  }
  const seconds = Math.max(
    0,
    Math.floor(
      ((!live && !waiting && row.finishedAt
        ? Date.parse(row.finishedAt)
        : now) -
        Date.parse(start)) /
        1000,
    ),
  );
  if (!Number.isFinite(seconds)) {
    return "—";
  }
  return seconds < 60
    ? `${seconds} 秒`
    : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

export function distributionTime(value: string, now: number): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "—";
  }
  const today = new Date(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const time = date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  if (date.toDateString() === today.toDateString()) {
    return `今天 ${time}`;
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return `昨天 ${time}`;
  }
  return `${date.toLocaleDateString("zh-CN", { ...(date.getFullYear() !== today.getFullYear() ? { year: "numeric" as const } : {}), month: "2-digit", day: "2-digit" })} ${time}`;
}

export type DistributionIssueKind =
  | "account"
  | "auth"
  | "media"
  | "unknown"
  | "cancelled"
  | "failed";

export interface DistributionIssue {
  kind: DistributionIssueKind;
  /** 状态标签 */
  label: string;
  /** 详情里的一句话原因 */
  title: string;
  /** 处理步骤，按顺序展示 */
  steps: string[];
}

/** 把失败 / 取消的账号任务归成几类，决定标签、处理步骤和主操作。 */
export function distributionIssue(
  row: Pick<
    DistributionTaskRow,
    "publishStatus" | "errorCode" | "accountAvailable"
  >,
): DistributionIssue | null {
  if (row.publishStatus !== "failed" && row.publishStatus !== "cancelled") {
    return null;
  }
  if (!row.accountAvailable) {
    return {
      kind: "account",
      label: "账号已移除",
      title: "这个账号已经移除",
      steps: ["到媒体账号重新添加该账号", "添加后在作品管理里重新分发"],
    };
  }
  if (row.publishStatus === "cancelled") {
    return {
      kind: "cancelled",
      label: "已取消",
      title: "这次发布已取消",
      steps: ["需要的话可以重新发布"],
    };
  }
  switch (row.errorCode) {
    case "AUTH_EXPIRED":
      return {
        kind: "auth",
        label: "授权过期",
        title: "账号登录已失效",
        steps: ["到媒体账号重新授权这个账号", "授权完成后回到这里重新发布"],
      };
    case "MEDIA_MISSING":
    case "MEDIA_UNREACHABLE":
      return {
        kind: "media",
        label: "素材找不到",
        title: "素材文件已被移动或删除",
        steps: ["打开作品重新选择素材文件", "保存后回到这里重新发布"],
      };
    case "PUBLISH_RESULT_UNKNOWN":
      return {
        kind: "unknown",
        label: "结果待确认",
        title: "上次提交后没有收到平台结果",
        steps: [
          "打开平台创作者后台的作品列表",
          "查找这条作品是否已经发出",
          "根据结果选择下面的操作",
        ],
      };
    default:
      return {
        kind: "failed",
        label: "发布失败",
        title: "这次没有发布成功",
        steps: ["检查原因后重新发布"],
      };
  }
}

/** 可以直接重新发布的账号任务（授权、素材、账号问题要先处理） */
export function canRetryDistribution(
  row: Pick<
    DistributionTaskRow,
    "publishStatus" | "errorCode" | "accountAvailable"
  >,
): boolean {
  const issue = distributionIssue(row);
  return issue !== null && ["failed", "cancelled"].includes(issue.kind);
}

export interface DistributionWorkProgress {
  succeeded: number;
  attention: number;
  running: number;
  waiting: number;
  total: number;
}

/** 作品进度条的分段统计：只统计当前显示的账号，实时任务优先。 */
export function distributionWorkProgress(
  rows: DistributionTaskRow[],
  tasks: DistributionLiveTask[],
): DistributionWorkProgress {
  const progress = { succeeded: 0, attention: 0, running: 0, waiting: 0 };
  for (const row of rows) {
    const live = tasks.find((task) => task.targetId === row.targetId);
    if (live) {
      progress[live.state === "waiting" ? "waiting" : "running"] += 1;
      continue;
    }
    switch (row.publishStatus) {
      case "succeeded":
        progress.succeeded += 1;
        break;
      case "failed":
      case "cancelled":
        progress.attention += 1;
        break;
      case "running":
        progress.running += 1;
        break;
      default:
        progress.waiting += 1;
    }
  }
  return { ...progress, total: rows.length };
}

/** 作品是否全部发布成功（且没有实时任务），用于把它收成一行 */
export function isDistributionWorkCompleted(
  rows: DistributionTaskRow[],
  tasks: DistributionLiveTask[],
): boolean {
  return rows.every(
    (row) =>
      row.publishStatus === "succeeded" &&
      !tasks.some((task) => task.targetId === row.targetId),
  );
}
