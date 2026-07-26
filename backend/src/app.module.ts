import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CoreModule, PermissionGuard, TeamConsistencyGuard } from '@pugying/core';
import {
  TeamManagementModule,
  TeamManagementTypeOrmModule,
} from '@pugying/team-management';
import {
  IdentityModule,
  IdentityTypeOrmModule,
  JwtAuthGuard,
} from '@pugying/identity';
import {
  AccountProModule,
  AccountProTypeOrmModule,
} from '@pugying/account-pro';
import {
  PlatformAccountModule,
  PlatformAccountTypeOrmModule,
} from '@pugying/platform-account';
import { ContentModule, ContentTypeOrmModule } from '@pugying/content';
import { PugyingTypeOrmSqliteModule } from '@pugying/typeorm';

import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';

/** ts-jest loads from src (*.ts); nest start loads from dist (*.js). */
const migrationsDir = join(__dirname, 'database', 'migrations');

@Module({
  imports: [
    CoreModule,
    PugyingTypeOrmSqliteModule.forRoot({
      database: 'pugying.db',
      migrations: [
        join(migrationsDir, '*.ts'),
        join(migrationsDir, '*.js'),
      ],
      migrationsRun: true,
    }),
    TeamManagementTypeOrmModule,
    IdentityTypeOrmModule,
    AccountProTypeOrmModule,
    PlatformAccountTypeOrmModule,
    ContentTypeOrmModule,
    TeamManagementModule,
    IdentityModule.forRoot({
      jwtSecret: process.env.JWT_SECRET ?? 'pugying-dev-secret-change-me',
      jwtExpiresIn: '7d',
      seed: true,
    }),
    AccountProModule,
    PlatformAccountModule,
    ContentModule,
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
    {
      provide: APP_GUARD,
      useClass: TeamConsistencyGuard,
    },
  ],
})
export class AppModule {}
