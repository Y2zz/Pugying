import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import type { IAccountRepository } from '../repositories/account.repository';
import { ACCOUNT_REPOSITORY } from '../repositories/account.repository';
import { Account } from '../entities/account.entity';
import { CreateAccountDto, UpdateAccountDto } from '@pugying/account/dtos';

@Injectable()
export class AccountService {
  constructor(
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: IAccountRepository,
  ) {}

  async create(dto: CreateAccountDto): Promise<Account> {
    const passwordHash = createHash('sha256').update(dto.password).digest('hex');
    const account = this.accountRepository.create({
      ...dto,
      passwordHash,
    });
    return this.accountRepository.save(account);
  }

  async findAll(): Promise<Account[]> {
    return this.accountRepository.findAll();
  }

  async findByTenant(tenantId: number): Promise<Account[]> {
    return this.accountRepository.findByTenantId(tenantId);
  }

  async findOne(id: number): Promise<Account> {
    const account = await this.accountRepository.findById(id);
    if (!account) {
      throw new NotFoundException(`Account #${id} not found`);
    }
    return account;
  }

  async update(id: number, dto: UpdateAccountDto): Promise<Account> {
    const account = await this.findOne(id);
    Object.assign(account, dto);
    return this.accountRepository.save(account);
  }

  async remove(id: number): Promise<void> {
    const account = await this.findOne(id);
    await this.accountRepository.remove(account);
  }
}
