import { Module, OnModuleInit } from '@nestjs/common';
import { PermissionRegistry } from '@pugying/core';
import { ContentService } from '@pugying/content/application/services/content.service';
import { ContentController } from '@pugying/content/http/controllers/content.controller';
import { contentPermissionList } from '@pugying/content/content.permissions';

@Module({
  controllers: [ContentController],
  providers: [ContentService],
  exports: [ContentService],
})
export class ContentModule implements OnModuleInit {
  constructor(private readonly permissionRegistry: PermissionRegistry) {}

  onModuleInit(): void {
    this.permissionRegistry.register(...contentPermissionList);
  }
}
