import type { MigrationInterface, QueryRunner } from 'typeorm';

type SqliteColumnRow = { name: string };
type SqliteNameRow = { name: string };

/**
 * 移除历史团队、用户、角色与成员关系。
 * 升级前应由桌面端创建 SQLite 与媒体目录备份；此迁移有意不可逆。
 * 对已执行过的库保持幂等（含曾以旧名 PersonalSingleMachine 登记的库）。
 */
export class DropTeamAndIdentity1784570000000 implements MigrationInterface {
  name = 'DropTeamAndIdentity1784570000000';

  /** 历史提交中曾用此 name；改名后已执行库不得再次变更 schema。 */
  private static readonly LEGACY_NAME = 'PersonalSingleMachine1784570000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await this.hasMigrationName(queryRunner, DropTeamAndIdentity1784570000000.LEGACY_NAME)) {
      // schema 已由旧名迁移完成；此处仅让 TypeORM 登记新 name
      return;
    }

    await queryRunner.query(`PRAGMA foreign_keys=OFF`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_content_team_type"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_content_team_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_content_target_team_account"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_content_target_publish_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_media_asset_team_kind"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_media_asset_team_checksum"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_platform_account_team_platform"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_platform_account_team_platform_user"`);

    await this.dropColumnIfExists(queryRunner, 'content', 'teamId');
    await this.dropColumnIfExists(queryRunner, 'content_target', 'teamId');
    await this.dropColumnIfExists(queryRunner, 'media_asset', 'teamId');
    await this.dropColumnIfExists(queryRunner, 'platform_account', 'teamId');

    await this.createIndexIfTableExists(
      queryRunner,
      'content',
      `CREATE INDEX IF NOT EXISTS "IDX_content_type" ON "content" ("type")`,
    );
    await this.createIndexIfTableExists(
      queryRunner,
      'content',
      `CREATE INDEX IF NOT EXISTS "IDX_content_status" ON "content" ("status")`,
    );
    await this.createIndexIfTableExists(
      queryRunner,
      'content_target',
      `CREATE INDEX IF NOT EXISTS "IDX_content_target_account" ON "content_target" ("platformAccountId")`,
    );
    await this.createIndexIfTableExists(
      queryRunner,
      'content_target',
      `CREATE INDEX IF NOT EXISTS "IDX_content_target_publish_status" ON "content_target" ("publishStatus")`,
    );
    // media_asset 可能已被后续 LocalPaths 迁移删除；仅在表仍存在时建索引
    await this.createIndexIfTableExists(
      queryRunner,
      'media_asset',
      `CREATE INDEX IF NOT EXISTS "IDX_media_asset_kind" ON "media_asset" ("kind")`,
    );
    await this.createIndexIfTableExists(
      queryRunner,
      'media_asset',
      `CREATE INDEX IF NOT EXISTS "IDX_media_asset_checksum" ON "media_asset" ("checksumSha256")`,
    );
    await this.createIndexIfTableExists(
      queryRunner,
      'platform_account',
      `CREATE INDEX IF NOT EXISTS "IDX_platform_account_platform" ON "platform_account" ("platform")`,
    );

    await queryRunner.query(`DROP TABLE IF EXISTS "user_role"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "team_user"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "role"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "account"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "team"`);

    await queryRunner.query(`PRAGMA foreign_keys=ON`);
  }

  public async down(): Promise<void> {
    throw new Error('该迁移不可逆；请从升级前备份恢复。');
  }

  private async hasMigrationName(
    queryRunner: QueryRunner,
    name: string,
  ): Promise<boolean> {
    const rows = (await queryRunner.query(
      `SELECT "name" FROM "migrations" WHERE "name" = ? LIMIT 1`,
      [name],
    )) as SqliteNameRow[];
    return rows.length > 0;
  }

  private async tableExists(
    queryRunner: QueryRunner,
    table: string,
  ): Promise<boolean> {
    const rows = (await queryRunner.query(
      `SELECT "name" FROM "sqlite_master" WHERE "type" = 'table' AND "name" = ? LIMIT 1`,
      [table],
    )) as SqliteNameRow[];
    return rows.length > 0;
  }

  private async createIndexIfTableExists(
    queryRunner: QueryRunner,
    table: string,
    sql: string,
  ): Promise<void> {
    if (!(await this.tableExists(queryRunner, table))) {
      return;
    }
    await queryRunner.query(sql);
  }

  private async dropColumnIfExists(
    queryRunner: QueryRunner,
    table: string,
    column: string,
  ): Promise<void> {
    if (!(await this.tableExists(queryRunner, table))) {
      return;
    }
    const rows = (await queryRunner.query(
      `PRAGMA table_info("${table}")`,
    )) as SqliteColumnRow[];
    if (!rows.some((row) => row.name === column)) {
      return;
    }
    await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "${column}"`);
  }
}
