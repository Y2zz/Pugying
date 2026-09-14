import { MigrationInterface, QueryRunner } from 'typeorm';

export class Content1784566000000 implements MigrationInterface {
  name = 'Content1784566000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "content" (
        "id" varchar PRIMARY KEY NOT NULL,
        "teamId" varchar NOT NULL,
        "type" varchar NOT NULL,
        "title" varchar NOT NULL,
        "body" text,
        "coverUrl" varchar,
        "mediaUrls" text NOT NULL DEFAULT ('[]'),
        "status" varchar NOT NULL DEFAULT ('draft'),
        "publishedAt" datetime,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        "deletedAt" datetime
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_content_team_type"
      ON "content" ("teamId", "type")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_content_team_status"
      ON "content" ("teamId", "status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_content_team_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_content_team_type"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "content"`);
  }
}
