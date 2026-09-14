import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 个人单机版：移除团队、用户、角色与成员关系。
 *
 * 升级前应由桌面端创建 SQLite 与媒体目录备份；此迁移是有意不可逆的。
 */
export class PersonalSingleMachine1784570000000 implements MigrationInterface {
  name = 'PersonalSingleMachine1784570000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`PRAGMA foreign_keys=OFF`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_content_team_type"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_content_team_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_content_target_team_account"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_content_target_publish_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_media_asset_team_kind"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_media_asset_team_checksum"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_platform_account_team_platform"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_platform_account_team_platform_user"`);

    await queryRunner.query(`ALTER TABLE "content" DROP COLUMN "teamId"`);
    await queryRunner.query(`ALTER TABLE "content_target" DROP COLUMN "teamId"`);
    await queryRunner.query(`ALTER TABLE "media_asset" DROP COLUMN "teamId"`);
    await queryRunner.query(`ALTER TABLE "platform_account" DROP COLUMN "teamId"`);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_content_type" ON "content" ("type")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_content_status" ON "content" ("status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_content_target_account" ON "content_target" ("platformAccountId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_content_target_publish_status" ON "content_target" ("publishStatus")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_media_asset_kind" ON "media_asset" ("kind")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_media_asset_checksum" ON "media_asset" ("checksumSha256")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_platform_account_platform" ON "platform_account" ("platform")`);

    await queryRunner.query(`DROP TABLE IF EXISTS "user_role"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "team_user"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "role"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "account"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "team"`);

    await queryRunner.query(`PRAGMA foreign_keys=ON`);
  }

  public async down(): Promise<void> {
    throw new Error('个人单机版迁移不可逆；请从升级前备份恢复。');
  }
}
