import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './entities/tenant.entity';
import { TENANT_REPOSITORY, TenantManagementRepository } from './repositories/tenant-management.repository';
import { TenantManagementService } from './services/tenant-management.service';
import { TenantManagementController } from './controllers/tenant-management.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant])],
  controllers: [TenantManagementController],
  providers: [
    TenantManagementService,
    {
      provide: TENANT_REPOSITORY,
      useClass: TenantManagementRepository,
    },
  ],
  exports: [TenantManagementService],
})
export class TenantManagementModule {}
