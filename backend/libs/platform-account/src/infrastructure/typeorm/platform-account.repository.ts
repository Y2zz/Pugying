import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { PlatformAccount } from '@pugying/platform-account/domain/entities/platform-account.entity';
import type { PlatformId } from '@pugying/platform-account/domain/platform-catalog';
import type { IPlatformAccountRepository } from '@pugying/platform-account/domain/repositories/platform-account.repository';
import { TypeOrmTeamFilter, TypeOrmTransactionContext } from '@pugying/typeorm';
import { DataSource, Repository } from 'typeorm';

@Injectable()
export class TypeOrmPlatformAccountRepository
  implements IPlatformAccountRepository
{
  constructor(
    @InjectRepository(PlatformAccount)
    private readonly repository: Repository<PlatformAccount>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly teamFilter: TypeOrmTeamFilter,
  ) {}

  private get repo(): Repository<PlatformAccount> {
    return TypeOrmTransactionContext.getManager(this.dataSource).getRepository(
      PlatformAccount,
    );
  }

  create(data: Partial<PlatformAccount>): PlatformAccount {
    return this.repo.create(data);
  }

  async findAllForCurrentTeam(platform?: PlatformId): Promise<PlatformAccount[]> {
    return this.repo.find(
      this.teamFilter.applyMany<PlatformAccount>({
        where: platform ? { platform } : undefined,
        order: { createdAt: 'DESC' },
      }),
    );
  }

  async findById(id: string): Promise<PlatformAccount | null> {
    return this.repo.findOne(
      this.teamFilter.applyOne<PlatformAccount>({ where: { id } }),
    );
  }

  async findByPlatformUser(
    teamId: string,
    platform: PlatformId,
    platformUserId: string,
  ): Promise<PlatformAccount | null> {
    return this.repo.findOne(
      this.teamFilter.applyOne<PlatformAccount>({
        where: {
          teamId,
          platform,
          platformUserId,
        },
      }),
    );
  }

  async save(account: PlatformAccount): Promise<PlatformAccount> {
    return this.repo.save(account);
  }

  async remove(account: PlatformAccount): Promise<void> {
    await this.repo.softRemove(account);
  }
}
