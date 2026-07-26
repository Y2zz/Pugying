/**
 * Lookup for team membership (implemented by @pugying/account-pro).
 */
export interface ITeamMembershipLookup {
  isMember(userId: string, teamId: string): Promise<boolean>;
  listUserIds(teamId: string): Promise<string[]>;
  getExtraPermissions(userId: string, teamId: string): Promise<string[]>;
}

export const TEAM_MEMBERSHIP_LOOKUP = 'ITeamMembershipLookup';
