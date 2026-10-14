import { MigrationInterface, QueryRunner } from 'typeorm';

export class PlatformAccount1784565000000 implements MigrationInterface {
  name = 'PlatformAccount1784565000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "platform_account" (
        "id" varchar PRIMARY KEY NOT NULL,
        "teamId" varchar NOT NULL,
        "platform" varchar NOT NULL,
        "displayName" varchar NOT NULL,
        "platformUserId" varchar,
        "credentialCipher" text NOT NULL,
        "status" varchar NOT NULL DEFAULT ('active'),
        "lastAuthedAt" datetime,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        "deletedAt" datetime
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_platform_account_team_platform"
      ON "platform_account" ("teamId", "platform")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_platform_account_team_platform"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "platform_account"`);
  }
}
