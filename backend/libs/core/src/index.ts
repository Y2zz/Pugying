export { CoreModule } from './core.module';

export { definePermissions } from './permissions/define-permissions';
export { PermissionRegistry } from './permissions/permission-registry';
export { PermissionChecker } from './permissions/permission-checker';
export type { AuthenticatedUser } from './permissions/permission-checker';
export { PermissionGuard } from './permissions/permission.guard';
export { RequirePermission, PERMISSIONS_KEY } from './permissions/require-permission.decorator';

export { Public, IS_PUBLIC_KEY } from './auth/public.decorator';
export { CurrentUser } from './auth/current-user.decorator';

export { CurrentTeam } from './multi-team/current-team';
export type { TeamContext } from './multi-team/current-team';
export { TeamMiddleware, TEAM_HEADER } from './multi-team/team.middleware';
export { TeamConsistencyGuard } from './multi-team/team-consistency.guard';
export type { IMultiTeam } from './multi-team/multi-team.interface';
export {
  TEAM_STORE,
  type ITeamStore,
  type TeamInfo,
} from './multi-team/team-store';

export { Entity } from './domain/entity.base';
export type { IEntity } from './domain/IEntity';
export {
  AuditedEntity,
  SoftDeleteAuditedEntity,
} from './domain/audited.entity';
export type { ISoftDelete } from './domain/ISoftDelete';

export { UNIT_OF_WORK, type IUnitOfWork } from './uow/unit-of-work';

export { CommercialModuleRegistry } from './commercial/commercial-module.registry';
export type { CommercialModuleInfo } from './commercial/commercial-module.registry';

export { PUGYING_MODULE_METADATA } from './module/pugying-module.metadata';
export type { PugyingModuleMetadata } from './module/pugying-module.metadata';
export { PugyingModule } from './module/pugying-module.decorator';
