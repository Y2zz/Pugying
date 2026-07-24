import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PermissionRegistry } from '@pugying/core';
import { TenantManagementService } from '@pugying/tenant-management';
import type { IUserRepository } from '../../domain/repositories/user.repository';
import { USER_REPOSITORY } from '../../domain/repositories/user.repository';
import { IDENTITY_MODULE_OPTIONS, type IdentityModuleOptions } from '../../identity.constants';

@Injectable()
export class IdentityBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(IdentityBootstrapService.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    private readonly tenantService: TenantManagementService,
    private readonly permissionRegistry: PermissionRegistry,
    @Inject(IDENTITY_MODULE_OPTIONS)
    private readonly options: IdentityModuleOptions,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.options.seed === false) {
      return;
    }

    const userCount = await this.userRepository.count();
    if (userCount > 0) {
      return;
    }

    this.logger.log('Seeding default tenant and admin user...');

    const tenants = await this.tenantService.findAll();
    let tenant = tenants[0];
    if (!tenant) {
      tenant = await this.tenantService.create({
        displayName: 'Default Tenant',
        name: 'default',
      });
    }

    const passwordHash = await bcrypt.hash('Admin123!', 10);
    const permissions = this.permissionRegistry.getAll();

    const admin = this.userRepository.create({
      email: 'admin@pugying.local',
      username: 'admin',
      passwordHash,
      tenantId: tenant.id,
      permissions,
      active: true,
    });
    await this.userRepository.save(admin);

    this.logger.log(
      `Seeded admin user admin@pugying.local / Admin123! (tenant=${tenant.name})`,
    );
  }
}
