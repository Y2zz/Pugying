import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { ITenantManagementRepository } from '../repositories/tenant-management.repository';
import { TENANT_REPOSITORY } from '../repositories/tenant-management.repository';
import { Tenant } from '../entities/tenant.entity';
import { CreateTenantDto, UpdateTenantDto } from '../dtos';

@Injectable()
export class TenantManagementService {
  constructor(
    @Inject(TENANT_REPOSITORY)
    private readonly tenantManagementRepository: ITenantManagementRepository,
  ) {}

  async create(dto: CreateTenantDto): Promise<Tenant> {
    const tenant = this.tenantManagementRepository.create(dto);
    return this.tenantManagementRepository.save(tenant);
  }

  async findAll(): Promise<Tenant[]> {
    return this.tenantManagementRepository.findAll();
  }

  async findOne(id: number): Promise<Tenant> {
    const tenant = await this.tenantManagementRepository.findById(id);
    if (!tenant) {
      throw new NotFoundException(`Tenant #${id} not found`);
    }
    return tenant;
  }

  async update(id: number, dto: UpdateTenantDto): Promise<Tenant> {
    const tenant = await this.findOne(id);
    Object.assign(tenant, dto);
    return this.tenantManagementRepository.save(tenant);
  }

  async remove(id: number): Promise<void> {
    const tenant = await this.findOne(id);
    await this.tenantManagementRepository.remove(tenant);
  }
}
