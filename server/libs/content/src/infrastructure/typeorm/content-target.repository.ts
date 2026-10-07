import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { ContentTarget } from '@pugying/content/domain/entities/content-target.entity';
import { Content } from '../../domain/entities/content.entity';
import type { DistributionFilter, DistributionPage, DistributionRow, DistributionView } from '../../domain/distribution';
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

  async findDistributionPage(filter: DistributionFilter): Promise<DistributionPage> {
    const base = this.repo.createQueryBuilder('target')
      .innerJoin(Content, 'content', 'content.id = target.contentId AND content.deletedAt IS NULL')
      .where("target.publishStatus <> 'idle'");
    const conditions: Record<DistributionView, string> = {
      active: "target.publishStatus = 'running'",
      waiting: "target.publishStatus = 'queued'",
      attention: "target.publishStatus IN ('failed', 'cancelled')",
      completed: "target.publishStatus = 'succeeded' AND target.finishedAt >= :since",
    };
    const since = filter.since.toISOString().replace('T', ' ').replace('Z', '');
    const counts = { active: 0, waiting: 0, attention: 0, completed: 0 };
    for (const view of Object.keys(conditions) as DistributionView[]) {
      counts[view] = await base.clone().andWhere(conditions[view], { since }).getCount();
    }
    const items = await base.clone().andWhere(conditions[filter.view], { since })
      .select('target.id', 'targetId').addSelect('target.contentId', 'contentId')
      .addSelect('content.title', 'title').addSelect('content.type', 'type')
      .addSelect('target.platformAccountId', 'accountId').addSelect('target.platform', 'platform')
      .addSelect('target.publishStatus', 'publishStatus').addSelect('target.startedAt', 'startedAt')
      .addSelect('target.finishedAt', 'finishedAt').addSelect('target.updatedAt', 'updatedAt')
      .addSelect('target.errorCode', 'errorCode').addSelect('target.errorMessage', 'errorMessage')
      .addSelect('target.platformUrl', 'platformUrl')
      .addSelect("(SELECT COUNT(*) FROM content_target t WHERE t.contentId = content.id AND t.publishStatus <> 'idle')", 'taskCount')
      .addSelect("(SELECT COUNT(*) FROM content_target t WHERE t.contentId = content.id AND t.publishStatus IN ('succeeded', 'failed', 'cancelled'))", 'processedCount')
      .orderBy('target.updatedAt', filter.view === 'completed' || filter.view === 'attention' ? 'DESC' : 'ASC')
      .addOrderBy('target.id', 'ASC').offset((filter.page - 1) * filter.pageSize).limit(filter.pageSize)
      .getRawMany<DistributionRow>();
    const iso = (value: string | null) => value ? new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`).toISOString() : null;
    return {
      items: items.map((item) => ({ ...item, startedAt: iso(item.startedAt), finishedAt: iso(item.finishedAt), updatedAt: iso(item.updatedAt)!, taskCount: Number(item.taskCount), processedCount: Number(item.processedCount) })),
      total: counts[filter.view], counts,
    };
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
