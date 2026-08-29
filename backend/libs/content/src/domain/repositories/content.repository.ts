import { Content } from '@pugying/content/domain/entities/content.entity';
import type { ContentType } from '@pugying/content/domain/content-types';

/** 列表筛选：类型 + 关键词（标题 / 正文 / 标签）+ 分页 */
export type ContentListFilter = {
  type?: ContentType;
  q?: string;
  page?: number;
  pageSize?: number;
};

export interface IContentRepository {
  create(data: Partial<Content>): Content;
  findPagedForCurrentTeam(
    filter?: ContentListFilter,
  ): Promise<{ rows: Content[]; total: number }>;
  findById(id: string): Promise<Content | null>;
  save(content: Content): Promise<Content>;
  remove(content: Content): Promise<void>;
}

export const CONTENT_REPOSITORY = 'IContentRepository';
