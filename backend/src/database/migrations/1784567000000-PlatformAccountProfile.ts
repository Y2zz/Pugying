import { MigrationInterface, QueryRunner } from 'typeorm';

export class PlatformAccountProfile1784567000000 implements MigrationInterface {
  name = 'PlatformAccountProfile1784567000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const columns = (await queryRunner.query(
      `PRAGMA table_info("platform_account")`,
    )) as { name: string }[];
    const hasAvatarUrl = columns.some((column) => column.name === 'avatarUrl');
    if (!hasAvatarUrl) {
      await queryRunner.query(
        `ALTER TABLE "platform_account" ADD COLUMN "avatarUrl" varchar`,
      );
    }
    // platformUserId is the rebind dedupe key; querying by it on every bind
    // is worth an index now that the Agent actually populates it.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_platform_account_team_platform_user"
      ON "platform_account" ("teamId", "platform", "platformUserId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_platform_account_team_platform_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "platform_account" DROP COLUMN "avatarUrl"`,
    );
  }
}
