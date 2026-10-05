import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Content } from '@pugying/content/domain/entities/content.entity';
import type { ContentCoverKind, ContentStatusCounts, ContentListFilter, IContentRepository } from '@pugying/content/domain/repositories/content.repository';
import { TypeOrmTransactionContext } from '@pugying/typeorm';
import { DataSource, Repository } from 'typeorm';

/** LIKE 通配符转义，避免用户输入 %/_ 扩大匹配面 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

@Injectable()
export class TypeOrmContentRepository implements IContentRepository {
  constructor(
    @InjectRepository(Content)
    private readonly repository: Repository<Content>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  private get repo(): Repository<Content> {
    return TypeOrmTransactionContext.getManager(this.dataSource).getRepository(Content);
  }

  create(data: Partial<Content>): Content {
    return this.repo.create(data);
  }

  async findPaged(filter: ContentListFilter = {}): Promise<{ rows: Content[]; total: number; counts: ContentStatusCounts }> {
    const qb = this.repo.createQueryBuilder('content').where('content.deletedAt IS NULL');
    if (filter.type) {
      qb.andWhere('content.type = :type', { type: filter.type });
    }
    const q = filter.q?.trim();
    if (q) {
      qb.andWhere(`(content.title LIKE :pattern ESCAPE '\\' OR IFNULL(content.body, '') LIKE :pattern ESCAPE '\\' OR content.tags LIKE :pattern ESCAPE '\\')`, {
        pattern: `%${escapeLike(q)}%`,
      });
    }
    // 数量沿用类型与搜索条件，忽略状态与分页；Target 优先于历史内容状态。
    const status = `CASE
      WHEN EXISTS (SELECT 1 FROM content_target t WHERE t.contentId = content.id AND t.publishStatus IN ('queued', 'running')) THEN 'publishing'
      WHEN EXISTS (SELECT 1 FROM content_target t WHERE t.contentId = content.id AND t.publishStatus IN ('failed', 'cancelled')) THEN 'needs_attention'
      WHEN EXISTS (SELECT 1 FROM content_target t WHERE t.contentId = content.id AND t.publishStatus = 'succeeded')
        AND NOT EXISTS (SELECT 1 FROM content_target t WHERE t.contentId = content.id AND t.publishStatus <> 'succeeded') THEN 'completed'
      WHEN EXISTS (SELECT 1 FROM content_target t WHERE t.contentId = content.id AND t.publishStatus = 'succeeded') THEN 'pending'
      WHEN content.status = 'draft' THEN 'draft'
      ELSE 'pending' END`;
    const groups = await qb
      .clone()
      .select(status, 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy(status)
      .getRawMany<{ status: keyof ContentStatusCounts; count: number | string }>();
    const counts: ContentStatusCounts = { all: 0, draft: 0, pending: 0, publishing: 0, needs_attention: 0, completed: 0 };
    for (const group of groups) {
      counts[group.status] = Number(group.count);
      counts.all += Number(group.count);
    }
    if (filter.managementStatus) {
      qb.andWhere(`(${status}) = :managementStatus`, { managementStatus: filter.managementStatus });
    }
    const total = filter.managementStatus ? counts[filter.managementStatus] : counts.all;
    const rows = await qb
      .orderBy('content.updatedAt', 'DESC')
      .addOrderBy('content.id', 'DESC')
      .skip(((filter.page ?? 1) - 1) * (filter.pageSize ?? 20))
      .take(filter.pageSize ?? 20)
      .getMany();
    return { rows, total, counts };
  }

  async findById(id: string): Promise<Content | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByIdWithCovers(id: string): Promise<Content | null> {
    return this.repo
      .createQueryBuilder('content')
      .addSelect('content.coverData')
      .addSelect('content.coverLandscapeData')
      .where('content.id = :id', { id })
      .andWhere('content.deletedAt IS NULL')
      .getOne();
  }

  async save(content: Content): Promise<Content> {
    return this.repo.save(omitUndefinedBlobs(content));
  }

  async remove(content: Content): Promise<void> {
    await this.repo.softRemove(content);
  }

  async setCover(id: string, kind: ContentCoverKind, mime: string, data: Buffer): Promise<void> {
    const patch = kind === 'portrait' ? { coverMime: mime, coverData: data } : { coverLandscapeMime: mime, coverLandscapeData: data };
    await this.repo.update({ id }, patch);
  }

  async clearCover(id: string, kind: ContentCoverKind): Promise<void> {
    const patch = kind === 'portrait' ? { coverMime: null, coverData: null } : { coverLandscapeMime: null, coverLandscapeData: null };
    await this.repo.update({ id }, patch);
  }
}

/** select:false 的 BLOB 未加载时为 undefined，save 时须剔除以免写成 NULL */
function omitUndefinedBlobs(content: Content): Content {
  const payload: Partial<Content> = { ...content };
  if (payload.coverData === undefined) {
    delete payload.coverData;
  }
  if (payload.coverLandscapeData === undefined) {
    delete payload.coverLandscapeData;
  }
  return payload as Content;
}
