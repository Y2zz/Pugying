import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import type { ITeamStore } from '@pugying/core';
import { Team } from '@pugying/team-management/domain/entities/team.entity';
import type { ITeamManagementRepository } from '@pugying/team-management/domain/repositories/team-management.repository';
import { TypeOrmTransactionContext } from '@pugying/typeorm';
import { DataSource, Repository } from 'typeorm';

@Injectable()
export class TypeOrmTeamManagementRepository
  implements ITeamManagementRepository, ITeamStore
{
  constructor(
    @InjectRepository(Team)
    private readonly repository: Repository<Team>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  private get repo(): Repository<Team> {
    return TypeOrmTransactionContext.getManager(this.dataSource).getRepository(
      Team,
    );
  }

  create(data: Partial<Team>): Team {
    return this.repo.create(data);
  }

  async findAll(): Promise<Team[]> {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }

  async findById(id: string): Promise<Team | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findBySlug(slug: string): Promise<Team | null> {
    return this.repo.findOne({ where: { name: slug } });
  }

  async save(team: Team): Promise<Team> {
    return this.repo.save(team);
  }

  async remove(team: Team): Promise<void> {
    await this.repo.softRemove(team);
  }
}
