import { Content } from '@pugying/content/domain/entities/content.entity';
import type { ContentType } from '@pugying/content/domain/content-types';

export interface IContentRepository {
  create(data: Partial<Content>): Content;
  findAllForCurrentTeam(type?: ContentType): Promise<Content[]>;
  findById(id: string): Promise<Content | null>;
  save(content: Content): Promise<Content>;
  remove(content: Content): Promise<void>;
}

export const CONTENT_REPOSITORY = 'IContentRepository';
