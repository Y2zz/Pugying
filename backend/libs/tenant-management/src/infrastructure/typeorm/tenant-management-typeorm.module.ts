import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TENANT_REPOSITORY } from '@pugying/tenant-management/domain/repositories/tenant-management.repository';
import { TenantEntitySchema } from './tenant.entity-schema';
import { TypeOrmTenantManagementRepository } from './tenant-management.repository';

/**
 * TypeORM persistence for TenantManagement — co-developed with the business module
 * (ABP-style *.EntityFrameworkCore companion). Import in the host AppModule.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([TenantEntitySchema])],
  providers: [
    {
      provide: TENANT_REPOSITORY,
      useClass: TypeOrmTenantManagementRepository,
    },
  ],
  exports: [TENANT_REPOSITORY, TypeOrmModule],
})
export class TenantManagementTypeOrmModule {}
