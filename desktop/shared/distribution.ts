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
