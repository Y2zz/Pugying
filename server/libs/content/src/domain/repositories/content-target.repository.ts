import { ContentTarget } from '@pugying/content/domain/entities/content-target.entity';
import type { ContentCoverKind } from '@pugying/content/domain/repositories/content.repository';

export interface IContentTargetRepository {
  create(data: Partial<ContentTarget>): ContentTarget;
  findById(id: string): Promise<ContentTarget | null>;
  findByIdWithCovers(id: string): Promise<ContentTarget | null>;
  findByContent(contentId: string): Promise<ContentTarget[]>;
  findByContents(contentIds: string[]): Promise<ContentTarget[]>;
  save(target: ContentTarget): Promise<ContentTarget>;
  saveMany(targets: ContentTarget[]): Promise<ContentTarget[]>;
  deleteByContent(contentId: string): Promise<void>;
  setCover(
    id: string,
    kind: ContentCoverKind,
    mime: string,
    data: Buffer,
  ): Promise<void>;
  clearCover(id: string, kind: ContentCoverKind): Promise<void>;
}

export const CONTENT_TARGET_REPOSITORY = 'IContentTargetRepository';
