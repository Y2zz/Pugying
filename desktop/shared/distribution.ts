export const DEFAULT_DISTRIBUTION_CONCURRENCY = 3;

export function isDistributionConcurrency(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

export interface DistributionSubmission {
  contentId: string;
  targetId?: string;
}

export type DistributionSubmissionResult =
  { ok: true; targetIds: string[] } | { ok: false; message: string };

export interface DistributionTargetRef {
  contentId: string;
  targetId: string;
}

export type DistributionActionResult =
  { ok: true } | { ok: false; message: string };

export interface DistributionBatchResult {
  /** 已加入队列的账号 */
  queued: string[];
  /** 未能加入队列的账号 */
  failed: string[];
}

/** all：单一列表，按作品紧急程度排序；其余为按状态的视图（侧栏角标使用 counts） */
export type DistributionView =
  "all" | "active" | "waiting" | "attention" | "completed";
export type DistributionStatusView = Exclude<DistributionView, "all">;
export interface DistributionLiveTask {
  contentId: string;
  targetId: string;
  accountId: string;
  state: "waiting" | "running" | "saving";
  waitingReason?: "account" | "capacity";
  phase?:
    | "accepted"
    | "fetching_media"
    | "opening_creator"
    | "uploading"
    | "submitting"
    | "done";
  /** 上传进度 0–100（来自平台适配器，无实现细节） */
  uploadPercent?: number;
  /** 上传速度字节/秒 */
  uploadSpeedBps?: number;
  queuedAt: string;
  startedAt?: string;
}
export interface DistributionSnapshot {
  revision: number;
  concurrency: number;
  tasks: DistributionLiveTask[];
}
export interface DistributionTaskRow {
  targetId: string;
  contentId: string;
  title: string;
  type: "article" | "graphic" | "video";
  accountId: string;
  accountName: string;
  accountAvailable: boolean;
  platform: string;
  publishStatus: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
  errorCode: string | null;
  errorMessage: string | null;
  platformUrl: string | null;
  taskCount: number;
  processedCount: number;
}
export type DistributionContentType = DistributionTaskRow["type"];
export type DistributionTypeFilter = "all" | DistributionContentType;
export interface DistributionFilters {
  type?: DistributionContentType;
  /** 多选平台，命中任一即可 */
  platforms?: string[];
  /** 多选账号，命中任一即可 */
  accountIds?: string[];
  q?: string;
  /** 仅 view=all 生效；false 时排除全部成功的作品 */
  includeCompleted?: boolean;
}
export interface DistributionPage {
  items: DistributionTaskRow[];
  /** 当前视图下符合条件的账号任务数 */
  total: number;
  /** 当前视图下符合条件的作品数；分页按作品计算 */
  workTotal: number;
  page: number;
  pageSize: number;
  counts: Record<DistributionStatusView, number>;
  /** 各作品类型的数量，不受类型筛选影响：view=all 时为作品数，其余视图为账号任务数 */
  typeCounts: Record<DistributionTypeFilter, number>;
}
