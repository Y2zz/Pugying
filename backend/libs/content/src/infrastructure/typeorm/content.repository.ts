import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Content } from '@pugying/content/domain/entities/content.entity';
import type { ContentType } from '@pugying/content/domain/content-types';
import type { IContentRepository } from '@pugying/content/domain/repositories/content.repository';
import { TypeOrmTeamFilter, TypeOrmTransactionContext } from '@pugying/typeorm';
import { DataSource, Repository } from 'typeorm';

@Injectable()
export class TypeOrmContentRepository implements IContentRepository {
  constructor(
    @InjectRepository(Content)
    private readonly repository: Repository<Content>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly teamFilter: TypeOrmTeamFilter,
  ) {}

  private get repo(): Repository<Content> {
    return TypeOrmTransactionContext.getManager(this.dataSource).getRepository(
      Content,
    );
  }

  create(data: Partial<Content>): Content {
    return this.repo.create(data);
  }

  async findAllForCurrentTeam(type?: ContentType): Promise<Content[]> {
    return this.repo.find(
      this.teamFilter.applyMany<Content>({
        where: type ? { type } : undefined,
        order: { updatedAt: 'DESC' },
      }),
    );
  }

  async findById(id: string): Promise<Content | null> {
    return this.repo.findOne(
      this.teamFilter.applyOne<Content>({ where: { id } }),
    );
  }

  async save(content: Content): Promise<Content> {
    return this.repo.save(content);
  }

  async remove(content: Content): Promise<void> {
    await this.repo.softRemove(content);
  }
}
