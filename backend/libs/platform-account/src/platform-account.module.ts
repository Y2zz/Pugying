import { Module, OnModuleInit } from '@nestjs/common';
import { PermissionRegistry } from '@pugying/core';
import { PlatformAccountService } from '@pugying/platform-account/application/services/platform-account.service';
import { PlatformAccountController } from '@pugying/platform-account/http/controllers/platform-account.controller';
import { platformAccountPermissionList } from '@pugying/platform-account/platform-account.permissions';

@Module({
  controllers: [PlatformAccountController],
  providers: [PlatformAccountService],
  exports: [PlatformAccountService],
})
export class PlatformAccountModule implements OnModuleInit {
  constructor(private readonly permissionRegistry: PermissionRegistry) {}

  onModuleInit(): void {
    this.permissionRegistry.register(...platformAccountPermissionList);
  }
}
