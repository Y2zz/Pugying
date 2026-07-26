import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import {
  PermissionRegistry,
  UNIT_OF_WORK,
  type IUnitOfWork,
} from '@pugying/core';
import {
  IdentityService,
  ROLE_REPOSITORY,
  USER_REPOSITORY,
  USER_ROLE_REPOSITORY,
  type IRoleRepository,
  type IUserRepository,
  type IUserRoleRepository,
} from '@pugying/identity';
import { TeamManagementService } from '@pugying/team-management';
import type { Team } from '@pugying/team-management';
import type { User } from '@pugying/identity';
import type { ITeamUserRepository } from '@pugying/account-pro/domain/repositories/team-user.repository';
import { TEAM_USER_REPOSITORY } from '@pugying/account-pro/domain/repositories/team-user.repository';

/**
 * Dev seed for shared accounts:
 * - teams: default, demo
 * - admin@pugying.local in BOTH teams (login shows team picker)
 * - editor@pugying.local only in demo (for invite / permission tests)
 */
@Injectable()
export class AccountProBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AccountProBootstrapService.name);

  constructor(
    @Inject(TEAM_USER_REPOSITORY)
    private readonly teamUserRepository: ITeamUserRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @Inject(ROLE_REPOSITORY)
    private readonly roleRepository: IRoleRepository,
    @Inject(USER_ROLE_REPOSITORY)
    private readonly userRoleRepository: IUserRoleRepository,
    private readonly teamService: TeamManagementService,
    private readonly identityService: IdentityService,
    private readonly permissionRegistry: PermissionRegistry,
    @Inject(UNIT_OF_WORK)
    private readonly unitOfWork: IUnitOfWork,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const membershipCount = await this.teamUserRepository.count();
    if (membershipCount > 0) {
      await this.syncAdminRolesWithRegisteredPermissions();
      return;
    }

    await this.unitOfWork.complete(async () => {
      const defaultTeam = await this.ensureTeam('default', 'Default Team');
      const demoTeam = await this.ensureTeam('demo', 'Demo Team');

      const admin = await this.ensureUser(
        'admin@pugying.local',
        'admin',
        'Admin123!',
      );
      const editor = await this.ensureUser(
        'editor@pugying.local',
        'editor',
        'Editor123!',
      );

      const allPermissions = this.permissionRegistry.getAll();
      const editorPermissions = allPermissions.filter(
        (p) =>
          p.startsWith('Identity.Users.View') ||
          p.startsWith('Identity.Roles.View') ||
          p === 'Account.Users.Leave',
      );

      await this.ensureMembershipWithAdminRole(
        admin,
        defaultTeam,
        allPermissions,
      );
      await this.ensureMembershipWithAdminRole(admin, demoTeam, allPermissions);
      await this.ensureMembershipWithRole(
        editor,
        demoTeam,
        'editor',
        editorPermissions,
      );

      this.logger.log(
        'Seeded shared accounts: admin↔default+demo, editor↔demo ' +
          '(admin@pugying.local / Admin123!, editor@pugying.local / Editor123!)',
      );
    });
  }

  private async syncAdminRolesWithRegisteredPermissions(): Promise<void> {
    const allPermissions = this.permissionRegistry.getAll();
    if (allPermissions.length === 0) {
      return;
    }

    await this.unitOfWork.complete(async () => {
      const teams = await this.teamService.findAll();
      for (const team of teams) {
        const role = await this.roleRepository.findByTeamAndName(
          team.id,
          'admin',
        );
        if (!role) {
          continue;
        }
        const missing = allPermissions.filter(
          (permission) => !role.permissions.includes(permission),
        );
        if (missing.length === 0) {
          continue;
        }
        role.permissions = [...new Set([...role.permissions, ...allPermissions])];
        await this.roleRepository.save(role);
        this.logger.log(
          `Synced ${missing.length} permission(s) into admin role (team=${team.name})`,
        );
      }
    });
  }

  private async ensureTeam(name: string, displayName: string): Promise<Team> {
    const teams = await this.teamService.findAll();
    const existing = teams.find((t) => t.name === name);
    if (existing) {
      return existing;
    }
    return this.teamService.create({ name, displayName });
  }

  private async ensureUser(
    email: string,
    username: string,
    password: string,
  ): Promise<User> {
    const existing = await this.userRepository.findByEmail(email);
    if (existing) {
      return existing;
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = this.userRepository.create({
      email,
      username,
      passwordHash,
      active: true,
    });
    return this.userRepository.save(user);
  }

  private async ensureMembershipWithAdminRole(
    user: User,
    team: Team,
    permissions: string[],
  ): Promise<void> {
    await this.ensureMembershipWithRole(user, team, 'admin', permissions);
  }

  private async ensureMembershipWithRole(
    user: User,
    team: Team,
    roleName: string,
    permissions: string[],
  ): Promise<void> {
    const existingMembership = await this.teamUserRepository.findByUserAndTeam(
      user.id,
      team.id,
    );
    if (!existingMembership) {
      const membership = this.teamUserRepository.create({
        userId: user.id,
        teamId: team.id,
        extraPermissions: [],
        leftAt: null,
      });
      await this.teamUserRepository.save(membership);
    } else if (existingMembership.leftAt) {
      existingMembership.leftAt = null;
      await this.teamUserRepository.save(existingMembership);
    }

    let role = await this.roleRepository.findByTeamAndName(team.id, roleName);
    if (!role) {
      role = await this.identityService.createRole({
        name: roleName,
        teamId: team.id,
        permissions,
      });
    }

    const assignment = await this.userRoleRepository.findByUserAndRole(
      user.id,
      role.id,
    );
    if (!assignment) {
      await this.userRoleRepository.save(
        this.userRoleRepository.create({
          userId: user.id,
          roleId: role.id,
        }),
      );
    }
  }
}
