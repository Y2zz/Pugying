import { MigrationInterface, QueryRunner } from 'typeorm';

export class ContentPublishTargets1784567000000 implements MigrationInterface {
  name = 'ContentPublishTargets1784567000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "content" ADD COLUMN "tags" text NOT NULL DEFAULT ('[]')`,
    );
    await queryRunner.query(
      `ALTER TABLE "content" ADD COLUMN "location" varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE "content" ADD COLUMN "visibility" varchar NOT NULL DEFAULT ('public')`,
    );
    await queryRunner.query(
      `ALTER TABLE "content" ADD COLUMN "scheduledAt" datetime`,
    );
    await queryRunner.query(
      `ALTER TABLE "content" ADD COLUMN "allowDownload" boolean NOT NULL DEFAULT (1)`,
    );

    await queryRunner.query(`
      CREATE TABLE "content_target" (
        "id" varchar PRIMARY KEY NOT NULL,
        "teamId" varchar NOT NULL,
        "contentId" varchar NOT NULL,
        "platformAccountId" varchar NOT NULL,
        "platform" varchar NOT NULL,
        "overrides" text NOT NULL DEFAULT ('{}'),
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "UQ_content_target_content_account"
          UNIQUE ("contentId", "platformAccountId")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_content_target_content"
      ON "content_target" ("contentId")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_content_target_team_account"
      ON "content_target" ("teamId", "platformAccountId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_content_target_team_account"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_content_target_content"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "content_target"`);
    await queryRunner.query(`ALTER TABLE "content" DROP COLUMN "allowDownload"`);
    await queryRunner.query(`ALTER TABLE "content" DROP COLUMN "scheduledAt"`);
    await queryRunner.query(`ALTER TABLE "content" DROP COLUMN "visibility"`);
    await queryRunner.query(`ALTER TABLE "content" DROP COLUMN "location"`);
    await queryRunner.query(`ALTER TABLE "content" DROP COLUMN "tags"`);
  }
}
