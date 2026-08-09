import type { MigrationInterface, QueryRunner } from 'typeorm';

export class MediaAssetChecksumIndex1784569000000
  implements MigrationInterface
{
  name = 'MediaAssetChecksumIndex1784569000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_media_asset_team_checksum"
      ON "media_asset" ("teamId", "checksumSha256")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_media_asset_team_checksum"`,
    );
  }
}
