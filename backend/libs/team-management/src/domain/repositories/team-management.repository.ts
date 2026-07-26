import { Team } from '@pugying/team-management/domain/entities/team.entity';

export interface ITeamManagementRepository {
  create(data: Partial<Team>): Team;
  findAll(): Promise<Team[]>;
  findById(id: string): Promise<Team | null>;
  findBySlug(slug: string): Promise<Team | null>;
  save(team: Team): Promise<Team>;
  remove(team: Team): Promise<void>;
}

export const TEAM_REPOSITORY = 'ITeamManagementRepository';
