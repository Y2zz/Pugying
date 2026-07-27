import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import {
  CurrentTeam,
  UNIT_OF_WORK,
  type IUnitOfWork,
} from '@pugying/core';
import type { IRoleRepository } from '@pugying/identity/domain/repositories/role.repository';
import { ROLE_REPOSITORY } from '@pugying/identity/domain/repositories/role.repository';
import type { ITeamMembershipLookup } from '@pugying/identity/domain/repositories/team-membership.lookup';
import { TEAM_MEMBERSHIP_LOOKUP } from '@pugying/identity/domain/repositories/team-membership.lookup';
import type { IUserRoleRepository } from '@pugying/identity/domain/repositories/user-role.repository';
import { USER_ROLE_REPOSITORY } from '@pugying/identity/domain/repositories/user-role.repository';
import type { IUserRepository } from '@pugying/identity/domain/repositories/user.repository';
import { USER_REPOSITORY } from '@pugying/identity/domain/repositories/user.repository';
import { Role } from '@pugying/identity/domain/entities/role.entity';
import { User } from '@pugying/identity/domain/entities/user.entity';
import {
  AssignRoleDto,
  CreateRoleDto,
  CreateUserDto,
  UpdateRoleDto,
  UpdateUserDto,
} from '@pugying/identity/application/dtos';

@Injectable()
export class IdentityService {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @Inject(ROLE_REPOSITORY)
    private readonly roleRepository: IRoleRepository,
    @Inject(USER_ROLE_REPOSITORY)
    private readonly userRoleRepository: IUserRoleRepository,
    private readonly currentTeam: CurrentTeam,
    @Inject(UNIT_OF_WORK)
    private readonly unitOfWork: IUnitOfWork,
    @Optional()
    @Inject(TEAM_MEMBERSHIP_LOOKUP)
    private readonly membershipLookup?: ITeamMembershipLookup,
  ) {}

  async create(dto: CreateUserDto): Promise<User> {
    const existingEmail = await this.userRepository.findByEmail(dto.email);
    if (existingEmail) {
      throw new ConflictException(`Email ${dto.email} already exists`);
    }

    const existingUsername = await this.userRepository.findByUsername(
      dto.username,
    );
    if (existingUsername) {
      throw new ConflictException(`Username ${dto.username} already exists`);
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = this.userRepository.create({
      email: dto.email,
      username: dto.username,
      passwordHash,
      active: true,
    });
    return this.userRepository.save(user);
  }

  async findAll(): Promise<User[]> {
    if (this.currentTeam.isAvailable && this.membershipLookup) {
      const userIds = await this.membershipLookup.listUserIds(
        this.currentTeam.id!,
      );
      return this.userRepository.findByIds(userIds);
    }
    return this.userRepository.findAll();
  }

  async findByTeam(teamId: string): Promise<User[]> {
    if (!this.membershipLookup) {
      return [];
    }
    const userIds = await this.membershipLookup.listUserIds(teamId);
    return this.userRepository.findByIds(userIds);
  }

  async findOne(id: string): Promise<User> {
    await this.assertTeamMembership(id);
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new NotFoundException(`User #${id} not found`);
    }
    return user;
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);
    if (dto.username && dto.username !== user.username) {
      const existingUsername = await this.userRepository.findByUsername(
        dto.username,
      );
      if (existingUsername && existingUsername.id !== user.id) {
        throw new ConflictException(`Username ${dto.username} already exists`);
      }
    }
    Object.assign(user, dto);
    return this.userRepository.save(user);
  }

  async remove(id: string): Promise<void> {
    const user = await this.findOne(id);
    await this.userRepository.remove(user);
  }

  async createRole(dto: CreateRoleDto): Promise<Role> {
    const teamId = this.resolveRoleTeamId(dto.teamId);

    return this.unitOfWork.complete(async () => {
      const existing = await this.roleRepository.findByTeamAndName(
        teamId,
        dto.name,
      );
      if (existing) {
        throw new ConflictException(
          `Role ${dto.name} already exists in team ${teamId}`,
        );
      }

      const role = this.roleRepository.create({
        name: dto.name,
        teamId,
        permissions: dto.permissions ?? [],
      });
      return this.roleRepository.save(role);
    });
  }

  async findRoles(teamId: string): Promise<Role[]> {
    return this.roleRepository.findByTeamId(teamId);
  }

  async findRole(id: string): Promise<Role> {
    const role = await this.roleRepository.findById(id);
    if (!role) {
      throw new NotFoundException(`Role #${id} not found`);
    }
    return role;
  }

  async updateRole(id: string, dto: UpdateRoleDto): Promise<Role> {
    return this.unitOfWork.complete(async () => {
      const role = await this.findRole(id);
      if (dto.name && dto.name !== role.name) {
        const existing = await this.roleRepository.findByTeamAndName(
          role.teamId,
          dto.name,
        );
        if (existing) {
          throw new ConflictException(
            `Role ${dto.name} already exists in team ${role.teamId}`,
          );
        }
      }
      Object.assign(role, dto);
      return this.roleRepository.save(role);
    });
  }

  async removeRole(id: string): Promise<void> {
    await this.unitOfWork.complete(async () => {
      const role = await this.findRole(id);
      await this.roleRepository.remove(role);
    });
  }

  async assignRole(userId: string, dto: AssignRoleDto): Promise<void> {
    await this.unitOfWork.complete(async () => {
      await this.findOne(userId);
      const role = await this.findRole(dto.roleId);
      if (
        this.currentTeam.isAvailable &&
        role.teamId !== this.currentTeam.id
      ) {
        throw new ForbiddenException('Role does not belong to current team');
      }

      const existing = await this.userRoleRepository.findByUserAndRole(
        userId,
        dto.roleId,
      );
      if (existing) {
        return;
      }

      const assignment = this.userRoleRepository.create({
        userId,
        roleId: dto.roleId,
      });
      await this.userRoleRepository.save(assignment);
    });
  }

  async unassignRole(userId: string, roleId: string): Promise<void> {
    await this.unitOfWork.complete(async () => {
      await this.findOne(userId);
      const existing = await this.userRoleRepository.findByUserAndRole(
        userId,
        roleId,
      );
      if (!existing) {
        throw new NotFoundException('User role assignment not found');
      }
      await this.userRoleRepository.remove(existing);
    });
  }

  /** Roles assigned to the user within the current team. */
  async findUserRoles(userId: string): Promise<Role[]> {
    await this.assertTeamMembership(userId);
    if (!this.currentTeam.isAvailable) {
      return [];
    }
    const teamId = this.currentTeam.id!;
    const roleIds = await this.userRoleRepository.listRoleIdsForUser(userId);
    const roles: Role[] = [];
    for (const roleId of roleIds) {
      const role = await this.roleRepository.findByIdAny(roleId);
      if (!role || role.teamId !== teamId) {
        continue;
      }
      roles.push(role);
    }
    return roles;
  }

  /**
   * Effective permissions = role permissions in team ∪ membership extraPermissions.
   */
  async resolveEffectivePermissions(
    userId: string,
    teamId: string,
  ): Promise<string[]> {
    const roleIds = await this.userRoleRepository.listRoleIdsForUser(userId);
    const permissions = new Set<string>();

    for (const roleId of roleIds) {
      const role = await this.roleRepository.findByIdAny(roleId);
      if (!role || role.teamId !== teamId) {
        continue;
      }
      for (const permission of this.normalizePermissions(role.permissions)) {
        permissions.add(permission);
      }
    }

    if (this.membershipLookup) {
      const extras = await this.membershipLookup.getExtraPermissions(
        userId,
        teamId,
      );
      for (const permission of extras) {
        permissions.add(permission);
      }
    }

    return [...permissions];
  }

  toPublicUser(user: User): Omit<User, 'passwordHash'> {
    const { passwordHash, ...safeUser } = user;
    void passwordHash;
    return safeUser;
  }

  normalizePermissions(
    permissions: string[] | string | null | undefined,
  ): string[] {
    if (!permissions) {
      return [];
    }
    if (Array.isArray(permissions)) {
      return permissions;
    }
    if (typeof permissions === 'string') {
      try {
        const parsed = JSON.parse(permissions) as unknown;
        return Array.isArray(parsed) ? (parsed as string[]) : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  private resolveRoleTeamId(dtoTeamId: string): string {
    if (this.currentTeam.isAvailable) {
      if (dtoTeamId !== this.currentTeam.id) {
        throw new BadRequestException(
          'Role teamId must match current X-Team-Id',
        );
      }
      return this.currentTeam.id;
    }
    return dtoTeamId;
  }

  private async assertTeamMembership(userId: string): Promise<void> {
    if (!this.currentTeam.isAvailable || !this.membershipLookup) {
      return;
    }
    const member = await this.membershipLookup.isMember(
      userId,
      this.currentTeam.id!,
    );
    if (!member) {
      throw new NotFoundException(`User #${userId} not found`);
    }
  }
}
