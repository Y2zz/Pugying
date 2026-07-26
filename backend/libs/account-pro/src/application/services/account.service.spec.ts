import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { AuthenticatedUser, CurrentTeam, IUnitOfWork } from '@pugying/core';
import type { IdentityService } from '@pugying/identity';
import { User } from '@pugying/identity/domain/entities/user.entity';
import type { TeamManagementService } from '@pugying/team-management';
import { Team } from '@pugying/team-management/domain/entities/team.entity';
import { TeamUser } from '@pugying/account-pro/domain/entities/team-user.entity';
import { AccountService, type LoginRequiresTeamSelection, type LoginSuccess } from './account.service';

const USER_ID = 'user-1';
const EMAIL = 'user@example.com';
const PASSWORD = 'Secret123!';
const TEAM_A = 'team-a';
const TEAM_B = 'team-b';

class FakeCurrentTeam {
  id: string | null = null;

  get isAvailable(): boolean {
    return this.id !== null;
  }
}

function createTeam(id: string, overrides: Partial<Team> = {}): Team {
  return Object.assign(new Team(), {
    id,
    name: `${id}-slug`,
    displayName: `Team ${id}`,
    active: true,
    ...overrides,
  });
}

function createMembership(overrides: Partial<TeamUser> = {}): TeamUser {
  return Object.assign(new TeamUser(), {
    id: 'membership-1',
    userId: USER_ID,
    teamId: TEAM_A,
    extraPermissions: [],
    leftAt: null,
    ...overrides,
  });
}

function expectSelection(result: LoginSuccess | LoginRequiresTeamSelection): LoginRequiresTeamSelection {
  if (!('requiresTeamSelection' in result)) {
    throw new Error('Expected a team-selection response');
  }
  return result;
}

function expectSuccess(result: LoginSuccess | LoginRequiresTeamSelection): LoginSuccess {
  if ('requiresTeamSelection' in result) {
    throw new Error('Expected a login success response');
  }
  return result;
}

describe('AccountService', () => {
  let passwordHash: string;
  let user: User;
  let teams: Map<string, Team>;
  let userRepository: any;
  let teamUserRepository: any;
  let identityService: { resolveEffectivePermissions: jest.Mock };
  let teamService: { findOne: jest.Mock };
  let jwtService: { signAsync: jest.Mock };
  let currentTeam: FakeCurrentTeam;
  let service: AccountService;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(PASSWORD, 4);
  });

  beforeEach(() => {
    user = Object.assign(new User(), {
      id: USER_ID,
      email: EMAIL,
      username: 'user',
      passwordHash,
      active: true,
    });
    teams = new Map<string, Team>([
      [TEAM_A, createTeam(TEAM_A)],
      [TEAM_B, createTeam(TEAM_B)],
    ]);
    userRepository = {
      findByEmail: jest.fn(async (email: string) => (email === EMAIL ? user : null)),
      findById: jest.fn(async (id: string) => (id === USER_ID ? user : null)),
    };
    teamUserRepository = {
      create: jest.fn((data: Partial<TeamUser>) => Object.assign(new TeamUser(), data)),
      findById: jest.fn().mockResolvedValue(null),
      findActiveByUserAndTeam: jest.fn().mockResolvedValue(null),
      findByUserAndTeam: jest.fn().mockResolvedValue(null),
      findActiveByUserId: jest.fn().mockResolvedValue([]),
      findActiveByTeamId: jest.fn().mockResolvedValue([]),
      save: jest.fn(async (membership: TeamUser) => membership),
      remove: jest.fn().mockResolvedValue(undefined),
      count: jest.fn().mockResolvedValue(0),
    };
    identityService = {
      resolveEffectivePermissions: jest.fn().mockResolvedValue(['Identity.Users.View']),
    };
    teamService = {
      findOne: jest.fn(async (id: string) => {
        const team = teams.get(id);
        if (!team) {
          throw new NotFoundException(`Team #${id} not found`);
        }
        return team;
      }),
    };
    jwtService = { signAsync: jest.fn().mockResolvedValue('signed-jwt') };
    currentTeam = new FakeCurrentTeam();
    const unitOfWork: IUnitOfWork = { complete: (work) => work() };

    service = new AccountService(
      userRepository,
      teamUserRepository,
      identityService as unknown as IdentityService,
      teamService as unknown as TeamManagementService,
      jwtService as unknown as JwtService,
      currentTeam as unknown as CurrentTeam,
      unitOfWork,
    );
  });

  describe('login', () => {
    it('rejects unknown emails', async () => {
      await expect(service.login({ email: 'nobody@example.com', password: PASSWORD })).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects inactive users', async () => {
      user.active = false;

      await expect(service.login({ email: EMAIL, password: PASSWORD })).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects wrong passwords', async () => {
      await expect(service.login({ email: EMAIL, password: 'WrongPassword!' })).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects users without any team membership', async () => {
      teamUserRepository.findActiveByUserId.mockResolvedValue([]);

      await expect(service.login({ email: EMAIL, password: PASSWORD })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('logs straight in when the user belongs to exactly one team', async () => {
      teamUserRepository.findActiveByUserId.mockResolvedValue([createMembership({ teamId: TEAM_A })]);

      const result = expectSuccess(await service.login({ email: EMAIL, password: PASSWORD }));

      expect(result.accessToken).toBe('signed-jwt');
      expect(result.user).toEqual({
        id: USER_ID,
        email: EMAIL,
        username: 'user',
        teamId: TEAM_A,
        permissions: ['Identity.Users.View'],
      });
      expect(identityService.resolveEffectivePermissions).toHaveBeenCalledWith(USER_ID, TEAM_A);
      expect(jwtService.signAsync).toHaveBeenCalledWith({
        sub: USER_ID,
        email: EMAIL,
        username: 'user',
        teamId: TEAM_A,
        permissions: ['Identity.Users.View'],
      });
    });

    it('returns a team-selection ticket for multi-team users', async () => {
      teamUserRepository.findActiveByUserId.mockResolvedValue([createMembership({ teamId: TEAM_A }), createMembership({ id: 'membership-2', teamId: TEAM_B })]);

      const result = expectSelection(await service.login({ email: EMAIL, password: PASSWORD }));

      expect(result.requiresTeamSelection).toBe(true);
      expect(typeof result.loginTicket).toBe('string');
      expect(result.loginTicket.length).toBeGreaterThanOrEqual(24);
      expect(result.teams.map((team) => team.id).sort()).toEqual([TEAM_A, TEAM_B]);
      expect(result.teams[0]).toHaveProperty('displayName');
    });

    it('ignores inactive teams and auto-selects the remaining one', async () => {
      teams.set(TEAM_B, createTeam(TEAM_B, { active: false }));
      teamUserRepository.findActiveByUserId.mockResolvedValue([createMembership({ teamId: TEAM_A }), createMembership({ id: 'membership-2', teamId: TEAM_B })]);

      const result = expectSuccess(await service.login({ email: EMAIL, password: PASSWORD }));

      expect(result.user.teamId).toBe(TEAM_A);
    });

    it('skips memberships whose team no longer exists', async () => {
      teams.delete(TEAM_B);
      teamUserRepository.findActiveByUserId.mockResolvedValue([createMembership({ teamId: TEAM_A }), createMembership({ id: 'membership-2', teamId: TEAM_B })]);

      const result = expectSuccess(await service.login({ email: EMAIL, password: PASSWORD }));

      expect(result.user.teamId).toBe(TEAM_A);
    });
  });

  describe('selectTeam', () => {
    async function obtainTicket(): Promise<string> {
      teamUserRepository.findActiveByUserId.mockResolvedValue([createMembership({ teamId: TEAM_A }), createMembership({ id: 'membership-2', teamId: TEAM_B })]);
      const result = expectSelection(await service.login({ email: EMAIL, password: PASSWORD }));
      return result.loginTicket;
    }

    it('rejects unknown tickets', async () => {
      await expect(service.selectTeam({ loginTicket: 'bogus-ticket', teamId: TEAM_A })).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects expired tickets', async () => {
      const ticket = await obtainTicket();
      const realNow = Date.now();
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(realNow + 6 * 60 * 1000);

      try {
        await expect(service.selectTeam({ loginTicket: ticket, teamId: TEAM_A })).rejects.toBeInstanceOf(UnauthorizedException);
      } finally {
        nowSpy.mockRestore();
      }
    });

    it('rejects selecting a team the user is not a member of', async () => {
      const ticket = await obtainTicket();
      teamUserRepository.findActiveByUserAndTeam.mockResolvedValue(null);

      await expect(service.selectTeam({ loginTicket: ticket, teamId: 'team-c' })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects when the user got deactivated after login', async () => {
      const ticket = await obtainTicket();
      teamUserRepository.findActiveByUserAndTeam.mockResolvedValue(createMembership({ teamId: TEAM_B }));
      user.active = false;

      await expect(service.selectTeam({ loginTicket: ticket, teamId: TEAM_B })).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('issues a token for the selected team and consumes the ticket', async () => {
      const ticket = await obtainTicket();
      teamUserRepository.findActiveByUserAndTeam.mockResolvedValue(createMembership({ teamId: TEAM_B }));

      const result = await service.selectTeam({
        loginTicket: ticket,
        teamId: TEAM_B,
      });

      expect(result.user.teamId).toBe(TEAM_B);
      expect(teamUserRepository.findActiveByUserAndTeam).toHaveBeenCalledWith(USER_ID, TEAM_B);

      await expect(service.selectTeam({ loginTicket: ticket, teamId: TEAM_B })).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('switchTeam', () => {
    const currentUser: AuthenticatedUser = {
      id: USER_ID,
      email: EMAIL,
      username: 'user',
      teamId: TEAM_A,
      permissions: ['Identity.Users.View'],
    };

    it('rejects switching to a team the user is not a member of', async () => {
      teamUserRepository.findActiveByUserAndTeam.mockResolvedValue(null);

      await expect(service.switchTeam(currentUser, { teamId: TEAM_B })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('issues a token scoped to the target team', async () => {
      teamUserRepository.findActiveByUserAndTeam.mockResolvedValue(createMembership({ teamId: TEAM_B }));
      identityService.resolveEffectivePermissions.mockResolvedValue(['Content.Contents.View']);

      const result = await service.switchTeam(currentUser, { teamId: TEAM_B });

      expect(result.user.teamId).toBe(TEAM_B);
      expect(result.user.permissions).toEqual(['Content.Contents.View']);
      expect(identityService.resolveEffectivePermissions).toHaveBeenCalledWith(USER_ID, TEAM_B);
    });
  });

  describe('refreshClaims', () => {
    const currentUser: AuthenticatedUser = {
      id: USER_ID,
      email: EMAIL,
      username: 'user',
      teamId: TEAM_A,
      permissions: [],
    };

    it('rejects tokens without an active team', async () => {
      await expect(service.refreshClaims({ ...currentUser, teamId: null })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when the membership no longer exists', async () => {
      teamUserRepository.findActiveByUserAndTeam.mockResolvedValue(null);

      await expect(service.refreshClaims(currentUser)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects when the user is gone or inactive', async () => {
      teamUserRepository.findActiveByUserAndTeam.mockResolvedValue(createMembership());
      user.active = false;

      await expect(service.refreshClaims(currentUser)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('re-issues the token with freshly resolved permissions', async () => {
      teamUserRepository.findActiveByUserAndTeam.mockResolvedValue(createMembership());
      identityService.resolveEffectivePermissions.mockResolvedValue(['Identity.Roles.Manage']);

      const result = await service.refreshClaims(currentUser);

      expect(result.user.teamId).toBe(TEAM_A);
      expect(result.user.permissions).toEqual(['Identity.Roles.Manage']);
    });
  });

  describe('myTeams', () => {
    it('lists active teams of the user and skips inactive ones', async () => {
      teams.set(TEAM_B, createTeam(TEAM_B, { active: false }));
      teamUserRepository.findActiveByUserId.mockResolvedValue([createMembership({ teamId: TEAM_A }), createMembership({ id: 'membership-2', teamId: TEAM_B })]);

      const options = await service.myTeams(USER_ID);

      expect(options).toEqual([{ id: TEAM_A, name: `${TEAM_A}-slug`, displayName: `Team ${TEAM_A}` }]);
    });
  });

  describe('invite', () => {
    it('rejects inviting into a different team than the current one', async () => {
      currentTeam.id = TEAM_A;

      await expect(service.invite({ email: EMAIL, teamId: TEAM_B })).rejects.toBeInstanceOf(ForbiddenException);
      expect(teamService.findOne).not.toHaveBeenCalled();
    });

    it('rejects inviting into a non-existent team', async () => {
      await expect(service.invite({ email: EMAIL, teamId: 'team-missing' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects unknown invitee emails', async () => {
      await expect(service.invite({ email: 'stranger@example.com', teamId: TEAM_A })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects users who are already members', async () => {
      teamUserRepository.findByUserAndTeam.mockResolvedValue(createMembership({ leftAt: null }));

      await expect(service.invite({ email: EMAIL, teamId: TEAM_A })).rejects.toBeInstanceOf(ConflictException);
      expect(teamUserRepository.save).not.toHaveBeenCalled();
    });

    it('re-activates a left membership on re-invite', async () => {
      const left = createMembership({
        leftAt: new Date('2026-01-01T00:00:00Z'),
        extraPermissions: ['Old.Permission.View'],
      });
      teamUserRepository.findByUserAndTeam.mockResolvedValue(left);

      const result = (await service.invite({
        email: EMAIL,
        teamId: TEAM_A,
        extraPermissions: ['Content.Contents.View'],
      })) as TeamUser;

      expect(result).toBe(left);
      expect(result.leftAt).toBeNull();
      expect(result.extraPermissions).toEqual(['Content.Contents.View']);
      expect(teamUserRepository.create).not.toHaveBeenCalled();
    });

    it('creates a fresh membership inside the matching team context', async () => {
      currentTeam.id = TEAM_A;

      const result = (await service.invite({
        email: EMAIL,
        teamId: TEAM_A,
      })) as TeamUser;

      expect(result.userId).toBe(USER_ID);
      expect(result.teamId).toBe(TEAM_A);
      expect(result.extraPermissions).toEqual([]);
      expect(result.leftAt).toBeNull();
      expect(teamUserRepository.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('leave', () => {
    it('rejects leaving a team without a membership', async () => {
      teamUserRepository.findActiveByUserAndTeam.mockResolvedValue(null);

      await expect(service.leave(USER_ID, { teamId: TEAM_A })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects leaving the last remaining team', async () => {
      const membership = createMembership({ teamId: TEAM_A });
      teamUserRepository.findActiveByUserAndTeam.mockResolvedValue(membership);
      teamUserRepository.findActiveByUserId.mockResolvedValue([membership]);

      await expect(service.leave(USER_ID, { teamId: TEAM_A })).rejects.toBeInstanceOf(BadRequestException);
      expect(teamUserRepository.save).not.toHaveBeenCalled();
    });

    it('marks the membership as left', async () => {
      const membership = createMembership({ teamId: TEAM_A });
      teamUserRepository.findActiveByUserAndTeam.mockResolvedValue(membership);
      teamUserRepository.findActiveByUserId.mockResolvedValue([membership, createMembership({ id: 'membership-2', teamId: TEAM_B })]);

      await service.leave(USER_ID, { teamId: TEAM_A });

      expect(membership.leftAt).toBeInstanceOf(Date);
      expect(teamUserRepository.save).toHaveBeenCalledWith(membership);
    });
  });
});
