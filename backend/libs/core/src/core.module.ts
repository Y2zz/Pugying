import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { CommercialModuleRegistry } from './commercial/commercial-module.registry';
import { CurrentTenant } from './multi-tenancy/current-tenant';
import { TenantMiddleware } from './multi-tenancy/tenant.middleware';
import { PermissionChecker } from './permissions/permission-checker';
import { PermissionGuard } from './permissions/permission.guard';
import { PermissionRegistry } from './permissions/permission-registry';

@Global()
@Module({
  providers: [
    CurrentTenant,
    PermissionRegistry,
    PermissionChecker,
    PermissionGuard,
    CommercialModuleRegistry,
  ],
  exports: [
    CurrentTenant,
    PermissionRegistry,
    PermissionChecker,
    PermissionGuard,
    CommercialModuleRegistry,
  ],
})
export class CoreModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
