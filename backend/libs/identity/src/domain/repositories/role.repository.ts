import { Role } from '@pugying/identity/domain/entities/role.entity';

export interface IRoleRepository {
  create(data: Partial<Role>): Role;
  findById(id: string): Promise<Role | null>;
  /** Lookup without current-team filter (permission resolution). */
  findByIdAny(id: string): Promise<Role | null>;
  findByTeamId(teamId: string): Promise<Role[]>;
  findByTeamAndName(teamId: string, name: string): Promise<Role | null>;
  save(role: Role): Promise<Role>;
  remove(role: Role): Promise<void>;
}

export const ROLE_REPOSITORY = 'IRoleRepository';
