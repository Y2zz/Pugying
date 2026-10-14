import type { ContentType, TargetPublishStatus } from './content-types';

/** all：单一列表，按作品紧急程度排序；其余为按状态的旧视图（侧栏角标等仍使用 counts） */
export const DISTRIBUTION_VIEWS = ['all', 'active', 'waiting', 'attention', 'completed'] as const;
export type DistributionView = (typeof DISTRIBUTION_VIEWS)[number];
export type DistributionCounts = Record<Exclude<DistributionView, 'all'>, number>;
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
export type DistributionTypeCounts = Record<'all' | ContentType, number>;
export interface DistributionFilter {
  view: DistributionView;
  /** 按作品分页：一页最多 pageSize 个作品，作品下符合条件的账号全部返回 */
  page: number;
  pageSize: number;
  since: Date;
  type?: ContentType;
  /** 多选：命中任一平台 / 任一账号即可 */
  platforms?: string[];
  accountIds?: string[];
  /** 关键词匹配作品标题；keywordAccountIds 为名称命中关键词的账号，一并纳入 */
  keyword?: string;
  keywordAccountIds?: string[];
  /** 仅 view=all 生效；false 时排除全部成功的作品 */
  includeCompleted?: boolean;
}
export interface DistributionPage {
  items: DistributionRow[];
  /** 当前视图下符合条件的账号任务数 */
  total: number;
  /** 当前视图下符合条件的作品数，分页以此为准 */
  workTotal: number;
  counts: DistributionCounts;
  /** 按作品类型统计（不受类型筛选影响）：view=all 时为作品数，其余视图为账号任务数 */
  typeCounts: DistributionTypeCounts;
}
