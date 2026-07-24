import { Tenant } from '../entities/tenant.entity';

export interface ITenantManagementRepository {
  create(data: Partial<Tenant>): Tenant;
  findAll(): Promise<Tenant[]>;
  findById(id: string): Promise<Tenant | null>;
  findBySlug(slug: string): Promise<Tenant | null>;
  save(tenant: Tenant): Promise<Tenant>;
  remove(tenant: Tenant): Promise<void>;
}

export const TENANT_REPOSITORY = 'ITenantManagementRepository';
