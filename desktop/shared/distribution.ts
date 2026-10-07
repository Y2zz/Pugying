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

export type DistributionView = "active" | "waiting" | "attention" | "completed";
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
export interface DistributionPage {
  items: DistributionTaskRow[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<DistributionView, number>;
}
