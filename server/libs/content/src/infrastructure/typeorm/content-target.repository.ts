import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { ContentTarget } from '@pugying/content/domain/entities/content-target.entity';
import { Content } from '../../domain/entities/content.entity';
import type { DistributionCounts, DistributionFilter, DistributionPage, DistributionRow, DistributionTypeCounts, DistributionView } from '../../domain/distribution';
import type { ContentType } from '../../domain/content-types';
import { TARGET_COVER_COLUMNS, type ContentTargetCoverKind } from '@pugying/content/domain/repositories/content-target.repository';
import type { IContentTargetRepository } from '@pugying/content/domain/repositories/content-target.repository';
import { TypeOrmTransactionContext } from '@pugying/typeorm';
import { DataSource, In, Repository, type SelectQueryBuilder } from 'typeorm';

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
    const scoped = this.repo.createQueryBuilder('target')
      .innerJoin(Content, 'content', 'content.id = target.contentId AND content.deletedAt IS NULL')
      .where("target.publishStatus <> 'idle'");
    if (filter.platforms?.length) {
      scoped.andWhere('target.platform IN (:...platforms)', { platforms: filter.platforms });
    }
    if (filter.accountIds?.length) {
      scoped.andWhere('target.platformAccountId IN (:...accountIds)', { accountIds: filter.accountIds });
    }
    const keyword = filter.keyword?.trim();
    if (keyword) {
      const accountIds = filter.keywordAccountIds ?? [];
      scoped.andWhere(
        accountIds.length > 0
          ? "(content.title LIKE :pattern ESCAPE '\\' OR target.platformAccountId IN (:...keywordAccountIds))"
          : "content.title LIKE :pattern ESCAPE '\\'",
        { pattern: `%${escapeLike(keyword)}%`, keywordAccountIds: accountIds },
      );
    }
    const base = scoped.clone();
    if (filter.type) {
      base.andWhere('content.type = :type', { type: filter.type });
    }
    const conditions: Record<Exclude<DistributionView, 'all'>, string> = {
      active: "target.publishStatus = 'running'",
      waiting: "target.publishStatus = 'queued'",
      attention: "target.publishStatus IN ('failed', 'cancelled')",
      completed: "target.publishStatus = 'succeeded' AND target.finishedAt >= :since",
    };
    const since = filter.since.toISOString().replace('T', ' ').replace('Z', '');
    const counts = { active: 0, waiting: 0, attention: 0, completed: 0 };
    for (const view of Object.keys(conditions) as Array<keyof typeof conditions>) {
      counts[view] = await base.clone().andWhere(conditions[view], { since }).getCount();
    }
    if (filter.view === 'all') {
      return this.findAllStatusPage(filter, scoped, counts, since);
    }
    const typeRows = await scoped.clone().andWhere(conditions[filter.view], { since })
      .select('content.type', 'type').addSelect('COUNT(*)', 'count').groupBy('content.type')
      .getRawMany<{ type: ContentType; count: string | number }>();
    const typeCounts: DistributionTypeCounts = { all: 0, article: 0, graphic: 0, video: 0 };
    for (const row of typeRows) {
      if (row.type in typeCounts) {
        typeCounts[row.type] = Number(row.count);
        typeCounts.all += Number(row.count);
      }
    }
    const inView = base.clone().andWhere(conditions[filter.view], { since });
    const workTotal = Number((await inView.clone().select('COUNT(DISTINCT target.contentId)', 'count').getRawOne<{ count: string | number }>())?.count ?? 0);
    const recentFirst = filter.view === 'completed' || filter.view === 'attention';
    const works = await inView.clone()
      .select('target.contentId', 'contentId')
      .addSelect(recentFirst ? 'MAX(target.updatedAt)' : 'MIN(target.updatedAt)', 'sortAt')
      .groupBy('target.contentId')
      .orderBy('sortAt', recentFirst ? 'DESC' : 'ASC').addOrderBy('target.contentId', 'ASC')
      .offset((filter.page - 1) * filter.pageSize).limit(filter.pageSize)
      .getRawMany<{ contentId: string }>();
    const items = await this.distributionRows(inView, works.map((work) => work.contentId), recentFirst);
    return { items, total: counts[filter.view], workTotal, counts, typeCounts };
  }

  /**
   * 单一列表：按作品最紧急的状态排序（需处理 > 发布中 > 排队 > 已完成），同档内最近更新在前。
   * 已完成只保留 24 小时内有成功结果的作品；includeCompleted=false 时整体排除。
   */
  private async findAllStatusPage(
    filter: DistributionFilter,
    scoped: SelectQueryBuilder<ContentTarget>,
    counts: DistributionCounts,
    since: string,
  ): Promise<DistributionPage> {
    const grouped = await scoped.clone()
      .andWhere("(target.publishStatus <> 'succeeded' OR target.finishedAt >= :since)", { since })
      .select('target.contentId', 'contentId').addSelect('content.type', 'type')
      .addSelect(
        "MIN(CASE target.publishStatus WHEN 'failed' THEN 0 WHEN 'cancelled' THEN 0 WHEN 'running' THEN 1 WHEN 'queued' THEN 2 ELSE 3 END)",
        'urgency',
      )
      .addSelect('MAX(target.updatedAt)', 'sortAt')
      .addSelect('COUNT(*)', 'targets')
      .groupBy('target.contentId').addGroupBy('content.type')
      .getRawMany<{ contentId: string; type: ContentType; urgency: string | number; sortAt: string; targets: string | number }>();
    const visible = grouped.filter((work) => filter.includeCompleted !== false || Number(work.urgency) < 3);
    const typeCounts: DistributionTypeCounts = { all: 0, article: 0, graphic: 0, video: 0 };
    for (const work of visible) {
      if (work.type in typeCounts) {
        typeCounts[work.type] += 1;
        typeCounts.all += 1;
      }
    }
    const works = visible
      .filter((work) => !filter.type || work.type === filter.type)
      .sort((left, right) => Number(left.urgency) - Number(right.urgency) || String(right.sortAt).localeCompare(String(left.sortAt)) || left.contentId.localeCompare(right.contentId));
    const pageWorks = works.slice((filter.page - 1) * filter.pageSize, filter.page * filter.pageSize).map((work) => work.contentId);
    const items = await this.distributionRows(scoped.clone(), pageWorks, true);
    return {
      items,
      total: works.reduce((sum, work) => sum + Number(work.targets), 0),
      workTotal: works.length,
      counts,
      typeCounts,
    };
  }

  private async distributionRows(query: SelectQueryBuilder<ContentTarget>, contentIds: string[], recentFirst: boolean): Promise<DistributionRow[]> {
    const items = contentIds.length === 0 ? [] : await query.clone().andWhere('target.contentId IN (:...contentIds)', { contentIds })
      .select('target.id', 'targetId').addSelect('target.contentId', 'contentId')
      .addSelect('content.title', 'title').addSelect('content.type', 'type')
      .addSelect('target.platformAccountId', 'accountId').addSelect('target.platform', 'platform')
      .addSelect('target.publishStatus', 'publishStatus').addSelect('target.startedAt', 'startedAt')
      .addSelect('target.finishedAt', 'finishedAt').addSelect('target.updatedAt', 'updatedAt')
      .addSelect('target.errorCode', 'errorCode').addSelect('target.errorMessage', 'errorMessage')
      .addSelect('target.platformUrl', 'platformUrl')
      .addSelect("(SELECT COUNT(*) FROM content_target t WHERE t.contentId = content.id AND t.publishStatus <> 'idle')", 'taskCount')
      .addSelect("(SELECT COUNT(*) FROM content_target t WHERE t.contentId = content.id AND t.publishStatus IN ('succeeded', 'failed', 'cancelled'))", 'processedCount')
      .orderBy('target.updatedAt', recentFirst ? 'DESC' : 'ASC')
      .addOrderBy('target.id', 'ASC')
      .getRawMany<DistributionRow>();
    const order = new Map(contentIds.map((id, index) => [id, index]));
    items.sort((left, right) => order.get(left.contentId)! - order.get(right.contentId)!);
    const iso = (value: string | null) => value ? new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`).toISOString() : null;
    return items.map((item) => ({ ...item, startedAt: iso(item.startedAt), finishedAt: iso(item.finishedAt), updatedAt: iso(item.updatedAt)!, taskCount: Number(item.taskCount), processedCount: Number(item.processedCount) }));
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

/** LIKE 通配符转义，避免用户输入 %/_ 扩大匹配面 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
