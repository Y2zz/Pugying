import { Module, OnModuleInit } from '@nestjs/common';
import { PermissionRegistry } from '@pugying/core';
import { TeamManagementService } from '@pugying/team-management/application/services/team-management.service';
import { TeamManagementController } from '@pugying/team-management/http/controllers/team-management.controller';
import { teamManagementPermissionList } from '@pugying/team-management/team-management.permissions';

/**
 * Team management business module — application / http only.
 * TypeORM mapping lives in TeamManagementTypeOrmModule (host imports both).
 */
@Module({
  controllers: [TeamManagementController],
  providers: [TeamManagementService],
  exports: [TeamManagementService],
})
export class TeamManagementModule implements OnModuleInit {
  constructor(private readonly permissionRegistry: PermissionRegistry) {}

  onModuleInit(): void {
    this.permissionRegistry.register(...teamManagementPermissionList);
  }
}
