import { Content } from '@pugying/content/domain/entities/content.entity';
import type { ContentType } from '@pugying/content/domain/content-types';

export const CONTENT_MANAGEMENT_STATUSES = ['draft', 'pending', 'publishing', 'needs_attention', 'completed'] as const;
export type ContentManagementStatus = (typeof CONTENT_MANAGEMENT_STATUSES)[number];
export type ContentStatusCounts = Record<ContentManagementStatus | 'all', number>;

/** 列表筛选：类型 + 关键词（标题 / 正文 / 标签）+ 分页 */
export type ContentListFilter = {
  type?: ContentType;
  q?: string;
  managementStatus?: ContentManagementStatus;
  page?: number;
  pageSize?: number;
};

export type ContentCoverKind = 'portrait' | 'landscape';

export interface IContentRepository {
  create(data: Partial<Content>): Content;
  findPaged(filter?: ContentListFilter): Promise<{ rows: Content[]; total: number; counts: ContentStatusCounts }>;
  findById(id: string): Promise<Content | null>;
  /** 含封面 BLOB，供预览与发布写出临时文件 */
  findByIdWithCovers(id: string): Promise<Content | null>;
  save(content: Content): Promise<Content>;
  remove(content: Content): Promise<void>;
  setCover(id: string, kind: ContentCoverKind, mime: string, data: Buffer): Promise<void>;
  clearCover(id: string, kind: ContentCoverKind): Promise<void>;
}

export const CONTENT_REPOSITORY = 'IContentRepository';
