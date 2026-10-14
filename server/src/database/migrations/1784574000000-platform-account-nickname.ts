import type { MigrationInterface, QueryRunner } from 'typeorm';

export class PlatformAccountNickname1784574000000 implements MigrationInterface {
  name = 'PlatformAccountNickname1784574000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Existing display names may be custom names; preserve them verbatim.
    await queryRunner.query(
      'ALTER TABLE "platform_account" ADD COLUMN "platformNickname" varchar',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "platform_account" DROP COLUMN "platformNickname"',
    );
  }
}
