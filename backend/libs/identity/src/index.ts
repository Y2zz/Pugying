export { IdentityModule } from './identity.module';
export { IdentityService } from './application/services/identity.service';
export { User } from './domain/entities/user.entity';
export { Role } from './domain/entities/role.entity';
export { UserRole } from './domain/entities/user-role.entity';
export {
  USER_REPOSITORY,
  type IUserRepository,
} from './domain/repositories/user.repository';
export {
  ROLE_REPOSITORY,
  type IRoleRepository,
} from './domain/repositories/role.repository';
export {
  USER_ROLE_REPOSITORY,
  type IUserRoleRepository,
} from './domain/repositories/user-role.repository';
export {
  TEAM_MEMBERSHIP_LOOKUP,
  type ITeamMembershipLookup,
} from './domain/repositories/team-membership.lookup';
export { IdentityTypeOrmModule } from './infrastructure/typeorm/identity-typeorm.module';
export { UserEntitySchema } from './infrastructure/typeorm/user.entity-schema';
export { RoleEntitySchema } from './infrastructure/typeorm/role.entity-schema';
export { UserRoleEntitySchema } from './infrastructure/typeorm/user-role.entity-schema';
export { JwtAuthGuard } from './infrastructure/jwt-auth.guard';
export {
  IDENTITY_MODULE_OPTIONS,
  type IdentityModuleOptions,
} from './identity.constants';
export {
  IdentityPermissions,
  identityPermissionList,
} from './identity.permissions';
export {
  CreateUserDto,
  UpdateUserDto,
  LoginDto,
  CreateRoleDto,
  UpdateRoleDto,
  AssignRoleDto,
} from './application/dtos';
