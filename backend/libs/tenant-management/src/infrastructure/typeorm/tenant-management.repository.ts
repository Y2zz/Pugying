import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '@pugying/tenant-management/domain/entities/tenant.entity';
import type { ITenantManagementRepository } from '@pugying/tenant-management/domain/repositories/tenant-management.repository';

@Injectable()
export class TypeOrmTenantManagementRepository
  implements ITenantManagementRepository
{
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

  async findById(id: string): Promise<Tenant | null> {
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
