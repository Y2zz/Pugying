import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { ContentTarget } from '@pugying/content/domain/entities/content-target.entity';
import type { ContentCoverKind } from '@pugying/content/domain/repositories/content.repository';
import type { IContentTargetRepository } from '@pugying/content/domain/repositories/content-target.repository';
import { TypeOrmTransactionContext } from '@pugying/typeorm';
import { DataSource, In, Repository } from 'typeorm';

@Injectable()
export class TypeOrmContentTargetRepository
  implements IContentTargetRepository
{
  constructor(
    @InjectRepository(ContentTarget)
    private readonly repository: Repository<ContentTarget>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  private get repo(): Repository<ContentTarget> {
    return TypeOrmTransactionContext.getManager(this.dataSource).getRepository(
      ContentTarget,
    );
  }

  create(data: Partial<ContentTarget>): ContentTarget {
    return this.repo.create(data);
  }

  async findById(id: string): Promise<ContentTarget | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByIdWithCovers(id: string): Promise<ContentTarget | null> {
    return this.repo
      .createQueryBuilder('target')
      .addSelect('target.coverData')
      .addSelect('target.coverLandscapeData')
      .where('target.id = :id', { id })
      .getOne();
  }

  async findByContent(contentId: string): Promise<ContentTarget[]> {
    return this.repo.find({
      where: { contentId },
      order: { createdAt: 'ASC' },
    });
  }

  async findByContents(contentIds: string[]): Promise<ContentTarget[]> {
    if (contentIds.length === 0) {
      return [];
    }
    return this.repo.find({
      where: { contentId: In(contentIds) },
      order: { createdAt: 'ASC' },
    });
  }

  async save(target: ContentTarget): Promise<ContentTarget> {
    return this.repo.save(omitUndefinedBlobs(target));
  }

  async saveMany(targets: ContentTarget[]): Promise<ContentTarget[]> {
    return this.repo.save(targets.map(omitUndefinedBlobs));
  }

  async deleteByContent(contentId: string): Promise<void> {
    const existing = await this.findByContent(contentId);
    if (existing.length > 0) {
      await this.repo.remove(existing);
    }
  }

  async setCover(
    id: string,
    kind: ContentCoverKind,
    mime: string,
    data: Buffer,
  ): Promise<void> {
    const patch =
      kind === 'portrait'
        ? { coverMime: mime, coverData: data }
        : { coverLandscapeMime: mime, coverLandscapeData: data };
    await this.repo.update({ id }, patch);
  }

  async clearCover(id: string, kind: ContentCoverKind): Promise<void> {
    const patch =
      kind === 'portrait'
        ? { coverMime: null, coverData: null }
        : { coverLandscapeMime: null, coverLandscapeData: null };
    await this.repo.update({ id }, patch);
  }
}

/** select:false 的 BLOB 未加载时为 undefined，save 时须剔除以免写成 NULL */
function omitUndefinedBlobs(target: ContentTarget): ContentTarget {
  const payload: Partial<ContentTarget> = { ...target };
  if (payload.coverData === undefined) {
    delete payload.coverData;
  }
  if (payload.coverLandscapeData === undefined) {
    delete payload.coverLandscapeData;
  }
  return payload as ContentTarget;
}
