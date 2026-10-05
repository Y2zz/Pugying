import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { ContentTarget } from '@pugying/content/domain/entities/content-target.entity';
import { TARGET_COVER_COLUMNS, type ContentTargetCoverKind } from '@pugying/content/domain/repositories/content-target.repository';
import type { IContentTargetRepository } from '@pugying/content/domain/repositories/content-target.repository';
import { TypeOrmTransactionContext } from '@pugying/typeorm';
import { DataSource, In, Repository } from 'typeorm';

@Injectable()
export class TypeOrmContentTargetRepository implements IContentTargetRepository {
  constructor(
    @InjectRepository(ContentTarget)
    private readonly repository: Repository<ContentTarget>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  private get repo(): Repository<ContentTarget> {
    return TypeOrmTransactionContext.getManager(this.dataSource).getRepository(ContentTarget);
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
      .addSelect('target.coverLandscape2Data')
      .addSelect('target.coverLandscape3Data')
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

  async setCover(id: string, kind: ContentTargetCoverKind, mime: string, data: Buffer): Promise<void> {
    const [mimeColumn, dataColumn] = TARGET_COVER_COLUMNS[kind];
    const patch = { [mimeColumn]: mime, [dataColumn]: data };
    await this.repo.update({ id }, patch);
  }

  async clearCover(id: string, kind: ContentTargetCoverKind): Promise<void> {
    const [mimeColumn, dataColumn] = TARGET_COVER_COLUMNS[kind];
    const patch = { [mimeColumn]: null, [dataColumn]: null };
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
  for (const column of ['coverLandscape2Data', 'coverLandscape3Data'] as const) {
    if (payload[column] === undefined) {
      delete payload[column];
    }
  }
  return payload as ContentTarget;
}
