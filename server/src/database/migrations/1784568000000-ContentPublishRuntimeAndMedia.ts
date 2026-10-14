import { MigrationInterface, QueryRunner } from 'typeorm';

export class ContentPublishRuntimeAndMedia1784568000000
  implements MigrationInterface
{
  name = 'ContentPublishRuntimeAndMedia1784568000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "content" ADD COLUMN "coverLandscapeUrl" varchar`,
    );

    await queryRunner.query(
      `ALTER TABLE "content_target" ADD COLUMN "publishStatus" varchar NOT NULL DEFAULT ('idle')`,
    );
    await queryRunner.query(
      `ALTER TABLE "content_target" ADD COLUMN "platformPostId" varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE "content_target" ADD COLUMN "platformUrl" varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE "content_target" ADD COLUMN "errorCode" varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE "content_target" ADD COLUMN "errorMessage" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "content_target" ADD COLUMN "startedAt" datetime`,
    );
    await queryRunner.query(
      `ALTER TABLE "content_target" ADD COLUMN "finishedAt" datetime`,
    );
    await queryRunner.query(`
      CREATE INDEX "IDX_content_target_publish_status"
      ON "content_target" ("teamId", "publishStatus")
    `);

    await queryRunner.query(`
      CREATE TABLE "media_asset" (
        "id" varchar PRIMARY KEY NOT NULL,
        "teamId" varchar NOT NULL,
        "kind" varchar NOT NULL,
        "originalName" varchar NOT NULL,
        "mimeType" varchar NOT NULL,
        "sizeBytes" integer NOT NULL,
        "storageKey" varchar NOT NULL,
        "checksumSha256" varchar,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        "deletedAt" datetime
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_media_asset_team_kind"
      ON "media_asset" ("teamId", "kind")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_media_asset_team_kind"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "media_asset"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_content_target_publish_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "content_target" DROP COLUMN "finishedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "content_target" DROP COLUMN "startedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "content_target" DROP COLUMN "errorMessage"`,
    );
    await queryRunner.query(
      `ALTER TABLE "content_target" DROP COLUMN "errorCode"`,
    );
    await queryRunner.query(
      `ALTER TABLE "content_target" DROP COLUMN "platformUrl"`,
    );
    await queryRunner.query(
      `ALTER TABLE "content_target" DROP COLUMN "platformPostId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "content_target" DROP COLUMN "publishStatus"`,
    );
    await queryRunner.query(
      `ALTER TABLE "content" DROP COLUMN "coverLandscapeUrl"`,
    );
  }
}
