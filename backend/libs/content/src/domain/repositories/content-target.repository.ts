import { ContentTarget } from '@pugying/content/domain/entities/content-target.entity';

export interface IContentTargetRepository {
  create(data: Partial<ContentTarget>): ContentTarget;
  findByContent(contentId: string): Promise<ContentTarget[]>;
  findByContents(contentIds: string[]): Promise<ContentTarget[]>;
  saveMany(targets: ContentTarget[]): Promise<ContentTarget[]>;
  deleteByContent(contentId: string): Promise<void>;
}

export const CONTENT_TARGET_REPOSITORY = 'IContentTargetRepository';
