import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { TeamUser } from '@pugying/account-pro/domain/entities/team-user.entity';
import type { ITeamUserRepository } from '@pugying/account-pro/domain/repositories/team-user.repository';
import { TypeOrmTeamFilter, TypeOrmTransactionContext } from '@pugying/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';

@Injectable()
export class TypeOrmTeamUserRepository implements ITeamUserRepository {
  constructor(
    @InjectRepository(TeamUser)
    private readonly repository: Repository<TeamUser>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly teamFilter: TypeOrmTeamFilter,
  ) {}

  private get repo(): Repository<TeamUser> {
    return TypeOrmTransactionContext.getManager(this.dataSource).getRepository(
      TeamUser,
    );
  }

  create(data: Partial<TeamUser>): TeamUser {
    return this.repo.create(data);
  }

  async findById(id: string): Promise<TeamUser | null> {
    return this.repo.findOne(
      this.teamFilter.applyOne<TeamUser>({ where: { id } }),
    );
  }

  async findActiveByUserAndTeam(
    userId: string,
    teamId: string,
  ): Promise<TeamUser | null> {
    // Explicit target team (login / switch) — do not force CurrentTeam.
    return this.repo.findOne({
      where: { userId, teamId, leftAt: IsNull() },
    });
  }

  async findByUserAndTeam(
    userId: string,
    teamId: string,
  ): Promise<TeamUser | null> {
    // Explicit target team (invite rejoin) — do not force CurrentTeam.
    return this.repo.findOne({
      where: { userId, teamId },
    });
  }

  async findActiveByUserId(userId: string): Promise<TeamUser[]> {
    // Cross-team membership list for one user.
    return this.repo.find({
      where: { userId, leftAt: IsNull() },
      order: { createdAt: 'ASC' },
    });
  }

  async findActiveByTeamId(teamId: string): Promise<TeamUser[]> {
    return this.repo.find(
      this.teamFilter.applyMany<TeamUser>({
        where: { teamId, leftAt: IsNull() },
        order: { createdAt: 'ASC' },
      }),
    );
  }

  async save(membership: TeamUser): Promise<TeamUser> {
    return this.repo.save(membership);
  }

  async remove(membership: TeamUser): Promise<void> {
    await this.repo.softRemove(membership);
  }

  async count(): Promise<number> {
    return this.repo.count();
  }
}
