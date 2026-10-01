import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 存量 content.type='article' 实为「多图+文案」图文语义，迁为 graphic；
 * 之后 article 专指富文本文章。
 */
export class ArticleToGraphic1784572000000 implements MigrationInterface {
  name = 'ArticleToGraphic1784572000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "content" SET "type" = 'graphic' WHERE "type" = 'article'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "content" SET "type" = 'article' WHERE "type" = 'graphic'`,
    );
  }
}
