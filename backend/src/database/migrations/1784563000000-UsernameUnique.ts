import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Enforce global unique username for shared-account strategy.
 */
export class UsernameUnique1784563000000 implements MigrationInterface {
  name = 'UsernameUnique1784563000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_account_username" ON "account" ("username")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_account_username"`);
  }
}
