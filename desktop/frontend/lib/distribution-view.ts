import type {
  DistributionLiveTask,
  DistributionTaskRow,
} from "@shared/distribution";
import { describePublishPhase } from "./publish-errors";
import { contentTargetMessage } from "./content-management";

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
    return describePublishPhase(live.phase ?? "accepted");
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
