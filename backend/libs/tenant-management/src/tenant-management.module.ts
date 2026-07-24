import { Module, OnModuleInit } from '@nestjs/common';
import { PermissionRegistry } from '@pugying/core';
import { TenantManagementService } from './application/services/tenant-management.service';
import { TenantManagementController } from './http/controllers/tenant-management.controller';
import { tenantManagementPermissionList } from './tenant-management.permissions';

/**
 * Tenant management business module — application / http only.
 * TypeORM mapping lives in TenantManagementTypeOrmModule (host imports both).
 */
@Module({
  controllers: [TenantManagementController],
  providers: [TenantManagementService],
  exports: [TenantManagementService],
})
export class TenantManagementModule implements OnModuleInit {
  constructor(private readonly permissionRegistry: PermissionRegistry) {}

  onModuleInit(): void {
    this.permissionRegistry.register(...tenantManagementPermissionList);
  }
}
