import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 取消媒体库：素材改为本机绝对路径；封面以 BLOB 落库；删除 media_asset。
 * 开发期不做旧资产迁移；升级前请自行备份。
 */
export class LocalPathsAndCoverBlobs1784571000000 implements MigrationInterface {
  name = 'LocalPathsAndCoverBlobs1784571000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`PRAGMA foreign_keys=OFF`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_media_asset_kind"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_media_asset_checksum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "media_asset"`);

    // SQLite 无法直接 RENAME COLUMN 到复杂类型组合时用重建表更稳妥
    await queryRunner.query(`
      CREATE TABLE "content_new" (
        "id" varchar PRIMARY KEY NOT NULL,
        "type" varchar NOT NULL,
        "title" varchar NOT NULL,
        "body" text,
        "coverMime" varchar,
        "coverData" blob,
        "coverLandscapeMime" varchar,
        "coverLandscapeData" blob,
        "mediaPaths" text NOT NULL DEFAULT '[]',
        "status" varchar NOT NULL DEFAULT 'draft',
        "publishedAt" datetime,
        "tags" text NOT NULL DEFAULT '[]',
        "location" varchar,
        "visibility" varchar NOT NULL DEFAULT 'public',
        "scheduledAt" datetime,
        "allowDownload" boolean NOT NULL DEFAULT 1,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        "deletedAt" datetime
      )
    `);

    // 旧 coverUrl / mediaUrls 不迁移；新列留空 / 空数组
    await queryRunner.query(`
      INSERT INTO "content_new" (
        "id", "type", "title", "body",
        "mediaPaths", "status", "publishedAt", "tags", "location",
        "visibility", "scheduledAt", "allowDownload",
        "createdAt", "updatedAt", "deletedAt"
      )
      SELECT
        "id", "type", "title", "body",
        '[]', "status", "publishedAt", "tags", "location",
        "visibility", "scheduledAt", "allowDownload",
        "createdAt", "updatedAt", "deletedAt"
      FROM "content"
    `);

    await queryRunner.query(`DROP TABLE "content"`);
    await queryRunner.query(`ALTER TABLE "content_new" RENAME TO "content"`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_content_type" ON "content" ("type")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_content_status" ON "content" ("status")`,
    );

    await queryRunner.query(`
      CREATE TABLE "content_target_new" (
        "id" varchar PRIMARY KEY NOT NULL,
        "contentId" varchar NOT NULL,
        "platformAccountId" varchar NOT NULL,
        "platform" varchar NOT NULL,
        "overrides" text NOT NULL DEFAULT '{}',
        "coverMime" varchar,
        "coverData" blob,
        "coverLandscapeMime" varchar,
        "coverLandscapeData" blob,
        "publishStatus" varchar NOT NULL DEFAULT 'idle',
        "platformPostId" varchar,
        "platformUrl" varchar,
        "errorCode" varchar,
        "errorMessage" text,
        "startedAt" datetime,
        "finishedAt" datetime,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);

    await queryRunner.query(`
      INSERT INTO "content_target_new" (
        "id", "contentId", "platformAccountId", "platform", "overrides",
        "publishStatus", "platformPostId", "platformUrl",
        "errorCode", "errorMessage", "startedAt", "finishedAt",
        "createdAt", "updatedAt"
      )
      SELECT
        "id", "contentId", "platformAccountId", "platform", "overrides",
        "publishStatus", "platformPostId", "platformUrl",
        "errorCode", "errorMessage", "startedAt", "finishedAt",
        "createdAt", "updatedAt"
      FROM "content_target"
    `);

    await queryRunner.query(`DROP TABLE "content_target"`);
    await queryRunner.query(
      `ALTER TABLE "content_target_new" RENAME TO "content_target"`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_content_target_content" ON "content_target" ("contentId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_content_target_account" ON "content_target" ("platformAccountId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_content_target_publish_status" ON "content_target" ("publishStatus")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_content_target_content_account" ON "content_target" ("contentId", "platformAccountId")`,
    );

    await queryRunner.query(`PRAGMA foreign_keys=ON`);
  }

  public async down(): Promise<void> {
    throw new Error('本地路径 + 封面落库迁移不可逆；请从升级前备份恢复。');
  }
}
