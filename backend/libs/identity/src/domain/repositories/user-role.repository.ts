import { UserRole } from '@pugying/identity/domain/entities/user-role.entity';

export interface IUserRoleRepository {
  create(data: Partial<UserRole>): UserRole;
  findByUserId(userId: string): Promise<UserRole[]>;
  findByUserAndRole(userId: string, roleId: string): Promise<UserRole | null>;
  save(userRole: UserRole): Promise<UserRole>;
  remove(userRole: UserRole): Promise<void>;
  listRoleIdsForUser(userId: string): Promise<string[]>;
}

export const USER_ROLE_REPOSITORY = 'IUserRoleRepository';
