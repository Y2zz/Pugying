import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { UserRole } from '@pugying/identity/domain/entities/user-role.entity';
import type { IUserRoleRepository } from '@pugying/identity/domain/repositories/user-role.repository';
import { TypeOrmTransactionContext } from '@pugying/typeorm';
import { DataSource, Repository } from 'typeorm';

@Injectable()
export class TypeOrmUserRoleRepository implements IUserRoleRepository {
  constructor(
    @InjectRepository(UserRole)
    private readonly repository: Repository<UserRole>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  private get repo(): Repository<UserRole> {
    return TypeOrmTransactionContext.getManager(this.dataSource).getRepository(
      UserRole,
    );
  }

  create(data: Partial<UserRole>): UserRole {
    return this.repo.create(data);
  }

  async findByUserId(userId: string): Promise<UserRole[]> {
    return this.repo.find({ where: { userId } });
  }

  async findByUserAndRole(
    userId: string,
    roleId: string,
  ): Promise<UserRole | null> {
    return this.repo.findOne({ where: { userId, roleId } });
  }

  async save(userRole: UserRole): Promise<UserRole> {
    return this.repo.save(userRole);
  }

  async remove(userRole: UserRole): Promise<void> {
    await this.repo.softRemove(userRole);
  }

  async listRoleIdsForUser(userId: string): Promise<string[]> {
    const rows = await this.findByUserId(userId);
    return rows.map((row) => row.roleId);
  }
}
