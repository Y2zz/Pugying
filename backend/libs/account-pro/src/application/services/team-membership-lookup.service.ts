import { Injectable, Inject } from '@nestjs/common';
import type { ITeamMembershipLookup } from '@pugying/identity/domain/repositories/team-membership.lookup';
import type { ITeamUserRepository } from '@pugying/account-pro/domain/repositories/team-user.repository';
import { TEAM_USER_REPOSITORY } from '@pugying/account-pro/domain/repositories/team-user.repository';

@Injectable()
export class TeamMembershipLookupService implements ITeamMembershipLookup {
  constructor(
    @Inject(TEAM_USER_REPOSITORY)
    private readonly teamUserRepository: ITeamUserRepository,
  ) {}

  async isMember(userId: string, teamId: string): Promise<boolean> {
    const membership = await this.teamUserRepository.findActiveByUserAndTeam(
      userId,
      teamId,
    );
    return Boolean(membership);
  }

  async listUserIds(teamId: string): Promise<string[]> {
    const rows = await this.teamUserRepository.findActiveByTeamId(teamId);
    return rows.map((row) => row.userId);
  }

  async getExtraPermissions(
    userId: string,
    teamId: string,
  ): Promise<string[]> {
    const membership = await this.teamUserRepository.findActiveByUserAndTeam(
      userId,
      teamId,
    );
    if (!membership) {
      return [];
    }
    return Array.isArray(membership.extraPermissions)
      ? membership.extraPermissions
      : [];
  }
}
