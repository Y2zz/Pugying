import { DynamicModule, Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UNIT_OF_WORK } from '@pugying/core';
import { TypeOrmUnitOfWork } from '@pugying/typeorm/uow/typeorm-unit-of-work';

export interface PugyingTypeOrmSqliteOptions {
  database: string;
  migrations?: string[];
  migrationsRun?: boolean;
}

/**
 * SQLite (better-sqlite3) connection provider — analogous to
 * Volo.Abp.EntityFrameworkCore.Sqlite.
 * Also registers the UnitOfWork implementation.
 */
@Global()
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
      providers: [
        TypeOrmUnitOfWork,
        {
          provide: UNIT_OF_WORK,
          useExisting: TypeOrmUnitOfWork,
        },
      ],
      exports: [UNIT_OF_WORK, TypeOrmUnitOfWork],
    };
  }
}
