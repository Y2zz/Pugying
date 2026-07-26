import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { CurrentTeam, IUnitOfWork } from '@pugying/core';
import { Role } from '@pugying/identity/domain/entities/role.entity';
import { User } from '@pugying/identity/domain/entities/user.entity';
import { UserRole } from '@pugying/identity/domain/entities/user-role.entity';
import { IdentityService } from './identity.service';

const TEAM_A = 'team-a';
const TEAM_B = 'team-b';

class FakeCurrentTeam {
  id: string | null = null;

  get isAvailable(): boolean {
    return this.id !== null;
  }
}

function createUser(overrides: Partial<User> = {}): User {
  return Object.assign(new User(), {
    id: 'user-1',
    email: 'user@example.com',
    username: 'user',
    passwordHash: 'irrelevant-hash',
    active: true,
    ...overrides,
  });
}

function createRole(overrides: Partial<Role> = {}): Role {
  return Object.assign(new Role(), {
    id: 'role-1',
    name: 'admin',
    teamId: TEAM_A,
    permissions: [],
    ...overrides,
  });
}

describe('IdentityService', () => {
  let userRepository: any;
  let roleRepository: any;
  let userRoleRepository: any;
  let membershipLookup: any;
  let currentTeam: FakeCurrentTeam;
  let unitOfWork: IUnitOfWork;
  let service: IdentityService;

  function buildService(options: { withLookup?: boolean } = {}): IdentityService {
    const { withLookup = true } = options;
    return new IdentityService(
      userRepository,
      roleRepository,
      userRoleRepository,
      currentTeam as unknown as CurrentTeam,
      unitOfWork,
      withLookup ? membershipLookup : undefined,
    );
  }

  beforeEach(() => {
    userRepository = {
      create: jest.fn((data: Partial<User>) => Object.assign(new User(), data)),
      findAll: jest.fn().mockResolvedValue([]),
      findByIds: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(null),
      findByEmail: jest.fn().mockResolvedValue(null),
      findByUsername: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      save: jest.fn(async (user: User) => user),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    roleRepository = {
      create: jest.fn((data: Partial<Role>) => Object.assign(new Role(), data)),
      findById: jest.fn().mockResolvedValue(null),
      findByIdAny: jest.fn().mockResolvedValue(null),
      findByTeamId: jest.fn().mockResolvedValue([]),
      findByTeamAndName: jest.fn().mockResolvedValue(null),
      save: jest.fn(async (role: Role) => role),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    userRoleRepository = {
      create: jest.fn((data: Partial<UserRole>) => Object.assign(new UserRole(), data)),
      findByUserId: jest.fn().mockResolvedValue([]),
      findByUserAndRole: jest.fn().mockResolvedValue(null),
      save: jest.fn(async (userRole: UserRole) => userRole),
      remove: jest.fn().mockResolvedValue(undefined),
      listRoleIdsForUser: jest.fn().mockResolvedValue([]),
    };
    membershipLookup = {
      isMember: jest.fn().mockResolvedValue(true),
      listUserIds: jest.fn().mockResolvedValue([]),
      getExtraPermissions: jest.fn().mockResolvedValue([]),
    };
    currentTeam = new FakeCurrentTeam();
    unitOfWork = { complete: (work) => work() };
    service = buildService();
  });

  describe('create', () => {
    it('hashes the password and saves an active user', async () => {
      const created = await service.create({
        email: 'new@example.com',
        username: 'newbie',
        password: 'Secret123!',
      });

      expect(created.email).toBe('new@example.com');
      expect(created.username).toBe('newbie');
      expect(created.active).toBe(true);
      expect(created.passwordHash).not.toBe('Secret123!');
      await expect(bcrypt.compare('Secret123!', created.passwordHash)).resolves.toBe(true);
      expect(userRepository.save).toHaveBeenCalledTimes(1);
    });

    it('rejects duplicate email with ConflictException', async () => {
      userRepository.findByEmail.mockResolvedValue(createUser());

      await expect(
        service.create({
          email: 'user@example.com',
          username: 'other',
          password: 'Secret123!',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(userRepository.save).not.toHaveBeenCalled();
    });

    it('rejects duplicate username with ConflictException', async () => {
      userRepository.findByUsername.mockResolvedValue(createUser());

      await expect(
        service.create({
          email: 'fresh@example.com',
          username: 'user',
          password: 'Secret123!',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('findAll', () => {
    it('returns every user outside of a team context', async () => {
      const users = [createUser()];
      userRepository.findAll.mockResolvedValue(users);

      await expect(service.findAll()).resolves.toBe(users);
      expect(membershipLookup.listUserIds).not.toHaveBeenCalled();
    });

    it('restricts to current team members inside a team context', async () => {
      currentTeam.id = TEAM_A;
      membershipLookup.listUserIds.mockResolvedValue(['user-1', 'user-2']);
      const users = [createUser({ id: 'user-1' }), createUser({ id: 'user-2' })];
      userRepository.findByIds.mockResolvedValue(users);

      await expect(service.findAll()).resolves.toBe(users);
      expect(membershipLookup.listUserIds).toHaveBeenCalledWith(TEAM_A);
      expect(userRepository.findByIds).toHaveBeenCalledWith(['user-1', 'user-2']);
      expect(userRepository.findAll).not.toHaveBeenCalled();
    });
  });

  describe('findByTeam', () => {
    it('resolves members through the membership lookup', async () => {
      membershipLookup.listUserIds.mockResolvedValue(['user-9']);
      const users = [createUser({ id: 'user-9' })];
      userRepository.findByIds.mockResolvedValue(users);

      await expect(service.findByTeam(TEAM_B)).resolves.toBe(users);
      expect(membershipLookup.listUserIds).toHaveBeenCalledWith(TEAM_B);
    });

    it('returns an empty list when no membership lookup is wired', async () => {
      service = buildService({ withLookup: false });

      await expect(service.findByTeam(TEAM_A)).resolves.toEqual([]);
      expect(userRepository.findByIds).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('returns the user by id', async () => {
      const user = createUser();
      userRepository.findById.mockResolvedValue(user);

      await expect(service.findOne('user-1')).resolves.toBe(user);
    });

    it('throws NotFoundException for unknown ids', async () => {
      await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('hides users of other teams behind NotFoundException', async () => {
      currentTeam.id = TEAM_A;
      membershipLookup.isMember.mockResolvedValue(false);

      await expect(service.findOne('user-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(membershipLookup.isMember).toHaveBeenCalledWith('user-1', TEAM_A);
      expect(userRepository.findById).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('merges the dto and saves', async () => {
      userRepository.findById.mockResolvedValue(createUser());

      const updated = await service.update('user-1', { username: 'renamed' });

      expect(updated.username).toBe('renamed');
      expect(userRepository.save).toHaveBeenCalledTimes(1);
    });

    it('rejects a username already taken by another user', async () => {
      userRepository.findById.mockResolvedValue(createUser());
      userRepository.findByUsername.mockResolvedValue(createUser({ id: 'user-2', username: 'taken' }));

      await expect(service.update('user-1', { username: 'taken' })).rejects.toBeInstanceOf(ConflictException);
    });

    it('skips the uniqueness check when the username is unchanged', async () => {
      userRepository.findById.mockResolvedValue(createUser());

      await service.update('user-1', { username: 'user' });

      expect(userRepository.findByUsername).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('removes an existing user', async () => {
      const user = createUser();
      userRepository.findById.mockResolvedValue(user);

      await service.remove('user-1');

      expect(userRepository.remove).toHaveBeenCalledWith(user);
    });

    it('throws NotFoundException for unknown users', async () => {
      await expect(service.remove('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('createRole', () => {
    it('uses the dto teamId outside of a team context', async () => {
      const role = await service.createRole({ name: 'editor', teamId: TEAM_B });

      expect(role.teamId).toBe(TEAM_B);
      expect(role.permissions).toEqual([]);
      expect(roleRepository.save).toHaveBeenCalledTimes(1);
    });

    it('rejects a teamId different from the current team', async () => {
      currentTeam.id = TEAM_A;

      await expect(service.createRole({ name: 'editor', teamId: TEAM_B })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates the role in the current team when ids match', async () => {
      currentTeam.id = TEAM_A;

      const role = await service.createRole({
        name: 'editor',
        teamId: TEAM_A,
        permissions: ['Content.Contents.View'],
      });

      expect(role.teamId).toBe(TEAM_A);
      expect(role.permissions).toEqual(['Content.Contents.View']);
    });

    it('rejects duplicate role names inside the same team', async () => {
      roleRepository.findByTeamAndName.mockResolvedValue(createRole());

      await expect(service.createRole({ name: 'admin', teamId: TEAM_A })).rejects.toBeInstanceOf(ConflictException);
      expect(roleRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('findRole / findRoles', () => {
    it('lists roles of a team', async () => {
      const roles = [createRole()];
      roleRepository.findByTeamId.mockResolvedValue(roles);

      await expect(service.findRoles(TEAM_A)).resolves.toBe(roles);
      expect(roleRepository.findByTeamId).toHaveBeenCalledWith(TEAM_A);
    });

    it('throws NotFoundException for unknown roles', async () => {
      await expect(service.findRole('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateRole', () => {
    it('rejects renaming to an existing role name in the team', async () => {
      roleRepository.findById.mockResolvedValue(createRole());
      roleRepository.findByTeamAndName.mockResolvedValue(createRole({ id: 'role-2', name: 'editor' }));

      await expect(service.updateRole('role-1', { name: 'editor' })).rejects.toBeInstanceOf(ConflictException);
    });

    it('merges changes and saves', async () => {
      roleRepository.findById.mockResolvedValue(createRole());

      const updated = await service.updateRole('role-1', {
        permissions: ['Identity.Users.View'],
      });

      expect(updated.permissions).toEqual(['Identity.Users.View']);
      expect(roleRepository.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('removeRole', () => {
    it('removes an existing role', async () => {
      const role = createRole();
      roleRepository.findById.mockResolvedValue(role);

      await service.removeRole('role-1');

      expect(roleRepository.remove).toHaveBeenCalledWith(role);
    });

    it('throws NotFoundException for unknown roles', async () => {
      await expect(service.removeRole('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('assignRole', () => {
    beforeEach(() => {
      userRepository.findById.mockResolvedValue(createUser());
      roleRepository.findById.mockResolvedValue(createRole());
    });

    it('creates a new assignment', async () => {
      await service.assignRole('user-1', { roleId: 'role-1' });

      expect(userRoleRepository.save).toHaveBeenCalledTimes(1);
      const saved = userRoleRepository.save.mock.calls[0][0] as UserRole;
      expect(saved.userId).toBe('user-1');
      expect(saved.roleId).toBe('role-1');
    });

    it('is idempotent for an existing assignment', async () => {
      userRoleRepository.findByUserAndRole.mockResolvedValue(Object.assign(new UserRole(), { userId: 'user-1', roleId: 'role-1' }));

      await service.assignRole('user-1', { roleId: 'role-1' });

      expect(userRoleRepository.save).not.toHaveBeenCalled();
    });

    it('rejects roles belonging to another team', async () => {
      currentTeam.id = TEAM_B;
      roleRepository.findById.mockResolvedValue(createRole({ teamId: TEAM_A }));

      await expect(service.assignRole('user-1', { roleId: 'role-1' })).rejects.toBeInstanceOf(ForbiddenException);
      expect(userRoleRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('unassignRole', () => {
    beforeEach(() => {
      userRepository.findById.mockResolvedValue(createUser());
    });

    it('removes an existing assignment', async () => {
      const assignment = Object.assign(new UserRole(), {
        userId: 'user-1',
        roleId: 'role-1',
      });
      userRoleRepository.findByUserAndRole.mockResolvedValue(assignment);

      await service.unassignRole('user-1', 'role-1');

      expect(userRoleRepository.remove).toHaveBeenCalledWith(assignment);
    });

    it('throws NotFoundException when the assignment does not exist', async () => {
      await expect(service.unassignRole('user-1', 'role-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('resolveEffectivePermissions', () => {
    it('unions team role permissions with membership extras', async () => {
      userRoleRepository.listRoleIdsForUser.mockResolvedValue(['role-1', 'role-2', 'role-3']);
      roleRepository.findByIdAny.mockImplementation(async (id: string) => {
        if (id === 'role-1') {
          return createRole({
            id,
            teamId: TEAM_A,
            permissions: ['Identity.Users.View', 'Identity.Users.Create'],
          });
        }
        if (id === 'role-2') {
          // Same-named role of another team must not leak permissions.
          return createRole({
            id,
            teamId: TEAM_B,
            permissions: ['TeamManagement.Teams.Delete'],
          });
        }
        return null;
      });
      membershipLookup.getExtraPermissions.mockResolvedValue(['Content.Contents.View', 'Identity.Users.View']);

      const permissions = await service.resolveEffectivePermissions('user-1', TEAM_A);

      expect(permissions.sort()).toEqual(['Content.Contents.View', 'Identity.Users.Create', 'Identity.Users.View']);
      expect(permissions).not.toContain('TeamManagement.Teams.Delete');
    });

    it('parses permissions stored as a JSON string', async () => {
      userRoleRepository.listRoleIdsForUser.mockResolvedValue(['role-1']);
      roleRepository.findByIdAny.mockResolvedValue(
        createRole({
          teamId: TEAM_A,
          permissions: '["Identity.Users.View"]' as unknown as string[],
        }),
      );

      await expect(service.resolveEffectivePermissions('user-1', TEAM_A)).resolves.toEqual(['Identity.Users.View']);
    });

    it('works without a membership lookup', async () => {
      service = buildService({ withLookup: false });
      userRoleRepository.listRoleIdsForUser.mockResolvedValue(['role-1']);
      roleRepository.findByIdAny.mockResolvedValue(createRole({ teamId: TEAM_A, permissions: ['Identity.Users.View'] }));

      await expect(service.resolveEffectivePermissions('user-1', TEAM_A)).resolves.toEqual(['Identity.Users.View']);
    });
  });

  describe('toPublicUser', () => {
    it('strips the password hash', () => {
      const publicUser = service.toPublicUser(createUser());

      expect(publicUser).not.toHaveProperty('passwordHash');
      expect(publicUser.email).toBe('user@example.com');
    });
  });

  describe('normalizePermissions', () => {
    it('passes arrays through', () => {
      expect(service.normalizePermissions(['A.B.C'])).toEqual(['A.B.C']);
    });

    it('parses JSON array strings', () => {
      expect(service.normalizePermissions('["A.B.C","D.E.F"]')).toEqual(['A.B.C', 'D.E.F']);
    });

    it('returns [] for invalid JSON', () => {
      expect(service.normalizePermissions('not-json')).toEqual([]);
    });

    it('returns [] for JSON that is not an array', () => {
      expect(service.normalizePermissions('{"a":1}')).toEqual([]);
    });

    it('returns [] for null and undefined', () => {
      expect(service.normalizePermissions(null)).toEqual([]);
      expect(service.normalizePermissions(undefined)).toEqual([]);
    });
  });
});
