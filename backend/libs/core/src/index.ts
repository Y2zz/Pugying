export { CoreModule } from './core.module';

export { definePermissions } from './permissions/define-permissions';
export type { PermissionContributor, PermissionDefinition } from './permissions/define-permissions';
export { PermissionRegistry } from './permissions/permission-registry';
export { PermissionChecker } from './permissions/permission-checker';
export type { AuthenticatedUser } from './permissions/permission-checker';
export { PermissionGuard } from './permissions/permission.guard';
export { RequirePermission, PERMISSIONS_KEY } from './permissions/require-permission.decorator';

export { Public, IS_PUBLIC_KEY } from './auth/public.decorator';
export { CurrentUser } from './auth/current-user.decorator';

export { CurrentTenant } from './multi-tenancy/current-tenant';
export type { TenantContext } from './multi-tenancy/current-tenant';
export { TenantMiddleware, TENANT_HEADER } from './multi-tenancy/tenant.middleware';
export type { IMultiTenant } from './multi-tenancy/multi-tenant.interface';

export { Entity } from './domain/entity.base';
export type { IEntity } from './domain/entity.base';
export { AuditedEntity } from './domain/audited.entity';
export type { ISoftDelete } from './domain/audited.entity';

export {
  CommercialModuleRegistry,
  COMMERCIAL_MODULE_MARKER,
} from './commercial/commercial-module.registry';
export type { CommercialModuleInfo } from './commercial/commercial-module.registry';

export { PUGYING_MODULE_METADATA } from './module/pugying-module.metadata';
export type { PugyingModuleMetadata } from './module/pugying-module.metadata';
