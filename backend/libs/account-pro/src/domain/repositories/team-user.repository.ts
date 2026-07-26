import { TeamUser } from '@pugying/account-pro/domain/entities/team-user.entity';

export interface ITeamUserRepository {
  create(data: Partial<TeamUser>): TeamUser;
  findById(id: string): Promise<TeamUser | null>;
  findActiveByUserAndTeam(
    userId: string,
    teamId: string,
  ): Promise<TeamUser | null>;
  /** Includes left memberships (leftAt set); used for invite rejoin. */
  findByUserAndTeam(userId: string, teamId: string): Promise<TeamUser | null>;
  findActiveByUserId(userId: string): Promise<TeamUser[]>;
  findActiveByTeamId(teamId: string): Promise<TeamUser[]>;
  save(membership: TeamUser): Promise<TeamUser>;
  remove(membership: TeamUser): Promise<void>;
  count(): Promise<number>;
}

export const TEAM_USER_REPOSITORY = 'ITeamUserRepository';
