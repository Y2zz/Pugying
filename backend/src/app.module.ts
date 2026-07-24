import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CoreModule, PermissionGuard } from '@pugying/core';
import {
  TenantManagementModule,
  TenantManagementTypeOrmModule,
} from '@pugying/tenant-management';
import {
  IdentityModule,
  IdentityTypeOrmModule,
  JwtAuthGuard,
} from '@pugying/identity';
import { PugyingTypeOrmSqliteModule } from '@pugying/typeorm';

import { resolve } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    CoreModule,
    PugyingTypeOrmSqliteModule.forRoot({
      database: 'pugying.db',
      migrations: [resolve(__dirname, 'database/migrations/*.js')],
      migrationsRun: true,
    }),
    TenantManagementTypeOrmModule,
    IdentityTypeOrmModule,
    TenantManagementModule,
    IdentityModule.forRoot({
      jwtSecret: process.env.JWT_SECRET ?? 'pugying-dev-secret-change-me',
      jwtExpiresIn: '7d',
      seed: true,
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionGuard,
    },
  ],
})
export class AppModule {}
