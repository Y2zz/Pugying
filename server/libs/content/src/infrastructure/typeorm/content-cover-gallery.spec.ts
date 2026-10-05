import { DataSource } from 'typeorm';
import { ArticleCoverGallery1784573000000 } from '../../../../../src/database/migrations/1784573000000-article-cover-gallery';
import { ContentTargetEntitySchema } from './content-target.entity-schema';
import { TypeOrmContentTargetRepository } from './content-target.repository';
import { ContentTarget } from '../../domain/entities/content-target.entity';

describe('article cover gallery persistence', () => {
  it('migrates existing rows, reads separate blobs and preserves them during status updates', async () => {
    const source = await new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: [ContentTargetEntitySchema] }).initialize();
    try {
      const runner = source.createQueryRunner();
      // 模拟迁移前结构并保留一条既有账号记录。
      await source.synchronize();
      const migration = new ArticleCoverGallery1784573000000();
      await migration.down(runner);
      await runner.query(
        `INSERT INTO content_target (id, contentId, platformAccountId, platform, overrides, publishStatus, createdAt, updatedAt) VALUES ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', 'toutiao', '{}', 'idle', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      );
      await migration.up(runner);
      const repository = new TypeOrmContentTargetRepository(source.getRepository(ContentTarget), source);
      const id = '11111111-1111-4111-8111-111111111111';
      await repository.setCover(id, 'landscape', 'image/jpeg', Buffer.from('first'));
      await repository.setCover(id, 'landscape2', 'image/png', Buffer.from('second'));
      await repository.setCover(id, 'landscape3', 'image/jpeg', Buffer.from('third'));
      const unloaded = (await repository.findById(id))!;
      expect(unloaded.coverLandscape2Data).toBeUndefined();
      unloaded.publishStatus = 'queued';
      await repository.save(unloaded);
      const loaded = (await repository.findByIdWithCovers(id))!;
      expect(loaded.coverLandscapeData).toEqual(Buffer.from('first'));
      expect(loaded.coverLandscape2Data).toEqual(Buffer.from('second'));
      expect(loaded.coverLandscape3Data).toEqual(Buffer.from('third'));
      expect(loaded.publishStatus).toBe('queued');
      await repository.clearCover(id, 'landscape2');
      expect((await repository.findByIdWithCovers(id))!.coverLandscape2Data).toBeNull();
      expect((await repository.findByIdWithCovers(id))!.coverLandscape3Data).toEqual(Buffer.from('third'));
      await runner.release();
    } finally {
      await source.destroy();
    }
  });
});
