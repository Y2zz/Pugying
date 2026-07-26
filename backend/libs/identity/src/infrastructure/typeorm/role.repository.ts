import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Role } from '@pugying/identity/domain/entities/role.entity';
import type { IRoleRepository } from '@pugying/identity/domain/repositories/role.repository';
import { TypeOrmTeamFilter, TypeOrmTransactionContext } from '@pugying/typeorm';
import { DataSource, Repository } from 'typeorm';

@Injectable()
export class TypeOrmRoleRepository implements IRoleRepository {
  constructor(
    @InjectRepository(Role)
    private readonly repository: Repository<Role>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly teamFilter: TypeOrmTeamFilter,
  ) {}

  private get repo(): Repository<Role> {
    return TypeOrmTransactionContext.getManager(this.dataSource).getRepository(
      Role,
    );
  }

  create(data: Partial<Role>): Role {
    return this.repo.create(data);
  }

  async findById(id: string): Promise<Role | null> {
    return this.repo.findOne(
      this.teamFilter.applyOne<Role>({ where: { id } }),
    );
  }

  async findByIdAny(id: string): Promise<Role | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByTeamId(teamId: string): Promise<Role[]> {
    return this.repo.find(
      this.teamFilter.applyMany<Role>({
        where: { teamId },
        order: { createdAt: 'DESC' },
      }),
    );
  }

  async findByTeamAndName(
    teamId: string,
    name: string,
  ): Promise<Role | null> {
    return this.repo.findOne(
      this.teamFilter.applyOne<Role>({ where: { teamId, name } }),
    );
  }

  async save(role: Role): Promise<Role> {
    return this.repo.save(role);
  }

  async remove(role: Role): Promise<void> {
    await this.repo.softRemove(role);
  }
}
