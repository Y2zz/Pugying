import type { ContentType, TargetPublishStatus } from './content-types';

export const DISTRIBUTION_VIEWS = ['active', 'waiting', 'attention', 'completed'] as const;
export type DistributionView = (typeof DISTRIBUTION_VIEWS)[number];
export type DistributionCounts = Record<DistributionView, number>;
export interface DistributionRow {
  targetId: string;
  contentId: string;
  title: string;
  type: ContentType;
  accountId: string;
  platform: string;
  publishStatus: TargetPublishStatus;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
  errorCode: string | null;
  errorMessage: string | null;
  platformUrl: string | null;
  taskCount: number;
  processedCount: number;
}
export interface DistributionFilter {
  view: DistributionView;
  page: number;
  pageSize: number;
  since: Date;
}
export interface DistributionPage {
  items: DistributionRow[];
  total: number;
  counts: DistributionCounts;
}
