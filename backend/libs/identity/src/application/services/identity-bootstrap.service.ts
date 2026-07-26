import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { TeamManagementService } from '@pugying/team-management';
import type { IUserRepository } from '@pugying/identity/domain/repositories/user.repository';
import { USER_REPOSITORY } from '@pugying/identity/domain/repositories/user.repository';
import {
  IDENTITY_MODULE_OPTIONS,
  type IdentityModuleOptions,
} from '@pugying/identity/identity.constants';

/**
 * Seeds default team + global admin user. Membership / roles are seeded by account-pro.
 */
@Injectable()
export class IdentityBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(IdentityBootstrapService.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    private readonly teamService: TeamManagementService,
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

    this.logger.log('Seeding default team and admin user...');

    const teams = await this.teamService.findAll();
    let team = teams[0];
    if (!team) {
      team = await this.teamService.create({
        displayName: 'Default Team',
        name: 'default',
      });
    }

    const passwordHash = await bcrypt.hash('Admin123!', 10);
    const admin = this.userRepository.create({
      email: 'admin@pugying.local',
      username: 'admin',
      passwordHash,
      active: true,
    });
    await this.userRepository.save(admin);

    this.logger.log(
      `Seeded admin user admin@pugying.local / Admin123! (default team=${team.name})`,
    );
  }
}
