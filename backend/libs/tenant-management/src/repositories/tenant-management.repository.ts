import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../entities/tenant.entity';

// ── 仓储接口 ──────────────────────────────────────────

export interface ITenantManagementRepository {
  create(data: Partial<Tenant>): Tenant;
  findAll(): Promise<Tenant[]>;
  findById(id: number): Promise<Tenant | null>;
  findBySlug(slug: string): Promise<Tenant | null>;
  save(tenant: Tenant): Promise<Tenant>;
  remove(tenant: Tenant): Promise<void>;
}

export const TENANT_REPOSITORY = 'ITenantManagementRepository';

// ── TypeORM 实现 ──────────────────────────────────────

@Injectable()
export class TenantManagementRepository implements ITenantManagementRepository {
  constructor(
    @InjectRepository(Tenant)
    private readonly repository: Repository<Tenant>,
  ) {}

  create(data: Partial<Tenant>): Tenant {
    return this.repository.create(data);
  }

  async findAll(): Promise<Tenant[]> {
    return this.repository.find({ order: { createdAt: 'DESC' } });
  }

  async findById(id: number): Promise<Tenant | null> {
    return this.repository.findOne({ where: { id } });
  }

  async findBySlug(slug: string): Promise<Tenant | null> {
    return this.repository.findOne({ where: { name: slug } });
  }

  async save(tenant: Tenant): Promise<Tenant> {
    return this.repository.save(tenant);
  }

  async remove(tenant: Tenant): Promise<void> {
    await this.repository.remove(tenant);
  }
}
