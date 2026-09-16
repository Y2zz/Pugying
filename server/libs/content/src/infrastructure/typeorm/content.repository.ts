import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Content } from '@pugying/content/domain/entities/content.entity';
import type {
  ContentCoverKind,
  ContentListFilter,
  IContentRepository,
} from '@pugying/content/domain/repositories/content.repository';
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
    return TypeOrmTransactionContext.getManager(this.dataSource).getRepository(
      Content,
    );
  }

  create(data: Partial<Content>): Content {
    return this.repo.create(data);
  }

  async findPaged(
    filter: ContentListFilter = {},
  ): Promise<{ rows: Content[]; total: number }> {
    const page = filter.page ?? 1;
    const pageSize = filter.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const q = filter.q?.trim();

    if (!q) {
      const [rows, total] = await this.repo.findAndCount({
        where: filter.type ? { type: filter.type } : undefined,
        order: { updatedAt: 'DESC' },
        skip,
        take: pageSize,
      });
      return { rows, total };
    }

    // 有关键词时用 QueryBuilder：标题 / 正文 / tags(JSON 文本) 模糊匹配
    const qb = this.repo
      .createQueryBuilder('content')
      .orderBy('content.updatedAt', 'DESC');

    // QueryBuilder 不自动带软删条件，需显式排除
    qb.andWhere('content.deletedAt IS NULL');

    if (filter.type) {
      qb.andWhere('content.type = :type', { type: filter.type });
    }

    const pattern = `%${escapeLike(q)}%`;
    qb.andWhere(
      `(content.title LIKE :pattern ESCAPE '\\' OR IFNULL(content.body, '') LIKE :pattern ESCAPE '\\' OR content.tags LIKE :pattern ESCAPE '\\')`,
      { pattern },
    );

    const [rows, total] = await qb.skip(skip).take(pageSize).getManyAndCount();
    return { rows, total };
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
