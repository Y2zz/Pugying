import { Module } from '@nestjs/common';
import { CoreModule } from '@pugying/core';
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
      database:
        process.env.PUGYING_DATABASE_PATH?.trim() || 'pugying.db',
      migrations: [
        join(migrationsDir, '*.ts'),
        join(migrationsDir, '*.js'),
      ],
      migrationsRun: true,
    }),
    PlatformAccountTypeOrmModule,
    ContentTypeOrmModule,
    PlatformAccountModule,
    ContentModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
