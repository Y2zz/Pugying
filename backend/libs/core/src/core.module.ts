import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { CommercialModuleRegistry } from '@pugying/core/commercial/commercial-module.registry';
import { CurrentTeam } from '@pugying/core/multi-team/current-team';
import { TeamConsistencyGuard } from '@pugying/core/multi-team/team-consistency.guard';
import { TeamMiddleware } from '@pugying/core/multi-team/team.middleware';
import { PermissionChecker } from '@pugying/core/permissions/permission-checker';
import { PermissionGuard } from '@pugying/core/permissions/permission.guard';
import { PermissionRegistry } from '@pugying/core/permissions/permission-registry';

@Global()
@Module({
  providers: [
    CurrentTeam,
    PermissionRegistry,
    PermissionChecker,
    PermissionGuard,
    TeamConsistencyGuard,
    TeamMiddleware,
    CommercialModuleRegistry,
  ],
  exports: [
    CurrentTeam,
    PermissionRegistry,
    PermissionChecker,
    PermissionGuard,
    TeamConsistencyGuard,
    CommercialModuleRegistry,
  ],
})
export class CoreModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TeamMiddleware).forRoutes('*');
  }
}
