import { ContentTarget } from '@pugying/content/domain/entities/content-target.entity';
import type { ContentCoverKind } from '@pugying/content/domain/repositories/content.repository';

export type ContentTargetCoverKind = ContentCoverKind | 'landscape2' | 'landscape3';

export const TARGET_COVER_COLUMNS = {
  portrait: ['coverMime', 'coverData'],
  landscape: ['coverLandscapeMime', 'coverLandscapeData'],
  landscape2: ['coverLandscape2Mime', 'coverLandscape2Data'],
  landscape3: ['coverLandscape3Mime', 'coverLandscape3Data'],
} as const;

export interface IContentTargetRepository {
  create(data: Partial<ContentTarget>): ContentTarget;
  findById(id: string): Promise<ContentTarget | null>;
  findByIdWithCovers(id: string): Promise<ContentTarget | null>;
  findByContent(contentId: string): Promise<ContentTarget[]>;
  findByContents(contentIds: string[]): Promise<ContentTarget[]>;
  save(target: ContentTarget): Promise<ContentTarget>;
  saveMany(targets: ContentTarget[]): Promise<ContentTarget[]>;
  deleteByContent(contentId: string): Promise<void>;
  setCover(id: string, kind: ContentTargetCoverKind, mime: string, data: Buffer): Promise<void>;
  clearCover(id: string, kind: ContentTargetCoverKind): Promise<void>;
}

export const CONTENT_TARGET_REPOSITORY = 'IContentTargetRepository';
