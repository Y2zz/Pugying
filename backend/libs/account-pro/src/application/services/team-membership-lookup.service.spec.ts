import { TeamUser } from '@pugying/account-pro/domain/entities/team-user.entity';
import { TeamMembershipLookupService } from './team-membership-lookup.service';

function createMembership(overrides: Partial<TeamUser> = {}): TeamUser {
  return Object.assign(new TeamUser(), {
    id: 'membership-1',
    userId: 'user-1',
    teamId: 'team-a',
    extraPermissions: [],
    leftAt: null,
    ...overrides,
  });
}

describe('TeamMembershipLookupService', () => {
  let teamUserRepository: any;
  let service: TeamMembershipLookupService;

  beforeEach(() => {
    teamUserRepository = {
      findActiveByUserAndTeam: jest.fn().mockResolvedValue(null),
      findActiveByTeamId: jest.fn().mockResolvedValue([]),
    };
    service = new TeamMembershipLookupService(teamUserRepository);
  });

  describe('isMember', () => {
    it('returns true for an active membership', async () => {
      teamUserRepository.findActiveByUserAndTeam.mockResolvedValue(createMembership());

      await expect(service.isMember('user-1', 'team-a')).resolves.toBe(true);
      expect(teamUserRepository.findActiveByUserAndTeam).toHaveBeenCalledWith('user-1', 'team-a');
    });

    it('returns false when no active membership exists', async () => {
      await expect(service.isMember('user-1', 'team-b')).resolves.toBe(false);
    });
  });

  describe('listUserIds', () => {
    it('maps active memberships to user ids', async () => {
      teamUserRepository.findActiveByTeamId.mockResolvedValue([
        createMembership({ userId: 'user-1' }),
        createMembership({ id: 'membership-2', userId: 'user-2' }),
      ]);

      await expect(service.listUserIds('team-a')).resolves.toEqual(['user-1', 'user-2']);
    });

    it('returns an empty list for empty teams', async () => {
      await expect(service.listUserIds('team-empty')).resolves.toEqual([]);
    });
  });

  describe('getExtraPermissions', () => {
    it('returns the membership extra permissions', async () => {
      teamUserRepository.findActiveByUserAndTeam.mockResolvedValue(createMembership({ extraPermissions: ['Content.Contents.View'] }));

      await expect(service.getExtraPermissions('user-1', 'team-a')).resolves.toEqual(['Content.Contents.View']);
    });

    it('returns [] when the user is not a member', async () => {
      await expect(service.getExtraPermissions('user-1', 'team-b')).resolves.toEqual([]);
    });

    it('returns [] when extraPermissions is not an array', async () => {
      teamUserRepository.findActiveByUserAndTeam.mockResolvedValue(
        createMembership({
          extraPermissions: 'not-an-array' as unknown as string[],
        }),
      );

      await expect(service.getExtraPermissions('user-1', 'team-a')).resolves.toEqual([]);
    });
  });
});
