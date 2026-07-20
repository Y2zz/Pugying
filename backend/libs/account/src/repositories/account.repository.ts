import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account } from '../entities/account.entity';

// ── 仓储接口 ──────────────────────────────────────────

export interface IAccountRepository {
  create(data: Partial<Account>): Account;
  findAll(): Promise<Account[]>;
  findByTenantId(tenantId: number): Promise<Account[]>;
  findById(id: number): Promise<Account | null>;
  findByEmail(email: string): Promise<Account | null>;
  save(account: Account): Promise<Account>;
  remove(account: Account): Promise<void>;
}

export const ACCOUNT_REPOSITORY = 'IAccountRepository';

// ── TypeORM 实现 ──────────────────────────────────────

@Injectable()
export class AccountRepository implements IAccountRepository {
  constructor(
    @InjectRepository(Account)
    private readonly repository: Repository<Account>,
  ) {}

  create(data: Partial<Account>): Account {
    return this.repository.create(data);
  }

  async findAll(): Promise<Account[]> {
    return this.repository.find({
      relations: { tenant: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findByTenantId(tenantId: number): Promise<Account[]> {
    return this.repository.find({
      where: { tenantId },
      relations: { tenant: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: number): Promise<Account | null> {
    return this.repository.findOne({
      where: { id },
      relations: { tenant: true },
    });
  }

  async findByEmail(email: string): Promise<Account | null> {
    return this.repository.findOne({ where: { email } });
  }

  async save(account: Account): Promise<Account> {
    return this.repository.save(account);
  }

  async remove(account: Account): Promise<void> {
    await this.repository.remove(account);
  }
}
