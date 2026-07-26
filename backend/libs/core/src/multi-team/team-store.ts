export interface TeamInfo {
  id: string;
  name: string;
  active: boolean;
}

/**
 * Resolves team metadata for middleware / host (implemented by team-management).
 */
export interface ITeamStore {
  findById(id: string): Promise<TeamInfo | null>;
}

export const TEAM_STORE = 'ITeamStore';
