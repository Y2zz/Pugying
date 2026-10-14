import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserPermissions1784560000000 implements MigrationInterface {
  name = 'AddUserPermissions1784560000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "account" ADD COLUMN "permissions" text NOT NULL DEFAULT '[]'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "account" DROP COLUMN "permissions"`);
  }
}
