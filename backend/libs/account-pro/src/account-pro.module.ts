import { Module, OnModuleInit } from '@nestjs/common';
import {
  CommercialModuleRegistry,
  PermissionRegistry,
  PugyingModule,
} from '@pugying/core';
import { TeamManagementModule } from '@pugying/team-management';
import { AccountController } from '@pugying/account-pro/http/controllers/account.controller';
import { AccountService } from '@pugying/account-pro/application/services/account.service';
import { AccountProBootstrapService } from '@pugying/account-pro/application/services/account-pro-bootstrap.service';
import { accountProPermissionList } from '@pugying/account-pro/account-pro.permissions';

@PugyingModule({
  name: '@pugying/account-pro',
  version: '0.0.1',
  description: 'Shared user accounts across teams (ABP Account Pro style)',
})
@Module({
  imports: [TeamManagementModule],
  controllers: [AccountController],
  providers: [AccountService, AccountProBootstrapService],
  exports: [AccountService],
})
export class AccountProModule implements OnModuleInit {
  constructor(
    private readonly permissionRegistry: PermissionRegistry,
    private readonly commercialModuleRegistry: CommercialModuleRegistry,
  ) {}

  onModuleInit(): void {
    this.permissionRegistry.register(...accountProPermissionList);
    this.commercialModuleRegistry.registerFromModule(AccountProModule);
  }
}
