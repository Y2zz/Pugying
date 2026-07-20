import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TenantManagementModule } from '@pugying/tenant-management';
import { AccountModule } from '@pugying/account';

import { resolve } from 'path';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: 'pugying.db',
      autoLoadEntities: true,
      migrations: [resolve(__dirname, 'database/migrations/*.js')],
      migrationsRun: true,
    }),
    TenantManagementModule,
    AccountModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
