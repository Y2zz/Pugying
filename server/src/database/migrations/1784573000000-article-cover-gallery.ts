import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ArticleCoverGallery1784573000000 implements MigrationInterface {
  name = 'ArticleCoverGallery1784573000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const index of [2, 3]) {
      await queryRunner.query(`ALTER TABLE "content_target" ADD COLUMN "coverLandscape${index}Mime" varchar`);
      await queryRunner.query(`ALTER TABLE "content_target" ADD COLUMN "coverLandscape${index}Data" blob`);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const index of [3, 2]) {
      await queryRunner.query(`ALTER TABLE "content_target" DROP COLUMN "coverLandscape${index}Data"`);
      await queryRunner.query(`ALTER TABLE "content_target" DROP COLUMN "coverLandscape${index}Mime"`);
    }
  }
}
