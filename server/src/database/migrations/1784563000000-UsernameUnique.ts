import { MigrationInterface, QueryRunner } from 'typeorm';

/** 为用户名增加全局唯一约束。 */
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
