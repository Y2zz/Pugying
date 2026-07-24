import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { CommercialModuleRegistry } from '@pugying/core/commercial/commercial-module.registry';
import { CurrentTenant } from '@pugying/core/multi-tenancy/current-tenant';
import { TenantMiddleware } from '@pugying/core/multi-tenancy/tenant.middleware';
import { PermissionChecker } from '@pugying/core/permissions/permission-checker';
import { PermissionGuard } from '@pugying/core/permissions/permission.guard';
import { PermissionRegistry } from '@pugying/core/permissions/permission-registry';

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
