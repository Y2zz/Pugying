import { Content } from '@pugying/content/domain/entities/content.entity';
import type { ContentType } from '@pugying/content/domain/content-types';

/** 列表筛选：类型 + 关键词（标题 / 正文 / 标签） */
export type ContentListFilter = {
  type?: ContentType;
  q?: string;
};

export interface IContentRepository {
  create(data: Partial<Content>): Content;
  findAllForCurrentTeam(filter?: ContentListFilter): Promise<Content[]>;
  findById(id: string): Promise<Content | null>;
  save(content: Content): Promise<Content>;
  remove(content: Content): Promise<void>;
}

export const CONTENT_REPOSITORY = 'IContentRepository';
