import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { ContentTarget } from '@pugying/content/domain/entities/content-target.entity';
import type { IContentTargetRepository } from '@pugying/content/domain/repositories/content-target.repository';
import { TypeOrmTeamFilter, TypeOrmTransactionContext } from '@pugying/typeorm';
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
    private readonly teamFilter: TypeOrmTeamFilter,
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
    return this.repo.findOne(
      this.teamFilter.applyOne<ContentTarget>({ where: { id } }),
    );
  }

  async findByContent(contentId: string): Promise<ContentTarget[]> {
    return this.repo.find(
      this.teamFilter.applyMany<ContentTarget>({
        where: { contentId },
        order: { createdAt: 'ASC' },
      }),
    );
  }

  async findByContents(contentIds: string[]): Promise<ContentTarget[]> {
    if (contentIds.length === 0) {
      return [];
    }
    return this.repo.find(
      this.teamFilter.applyMany<ContentTarget>({
        where: { contentId: In(contentIds) },
        order: { createdAt: 'ASC' },
      }),
    );
  }

  async save(target: ContentTarget): Promise<ContentTarget> {
    return this.repo.save(target);
  }

  async saveMany(targets: ContentTarget[]): Promise<ContentTarget[]> {
    return this.repo.save(targets);
  }

  async deleteByContent(contentId: string): Promise<void> {
    const existing = await this.findByContent(contentId);
    if (existing.length > 0) {
      await this.repo.remove(existing);
    }
  }
}
