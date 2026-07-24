import { DynamicModule, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

export interface PugyingTypeOrmSqliteOptions {
  database: string;
  migrations?: string[];
  migrationsRun?: boolean;
}

/**
 * SQLite (better-sqlite3) connection provider — analogous to
 * Volo.Abp.EntityFrameworkCore.Sqlite.
 */
@Module({})
export class PugyingTypeOrmSqliteModule {
  static forRoot(options: PugyingTypeOrmSqliteOptions): DynamicModule {
    return {
      module: PugyingTypeOrmSqliteModule,
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: options.database,
          autoLoadEntities: true,
          migrations: options.migrations,
          migrationsRun: options.migrationsRun ?? true,
        }),
      ],
    };
  }
}
