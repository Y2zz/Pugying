import { Content } from '@pugying/content/domain/entities/content.entity';
import { ContentTarget } from '@pugying/content/domain/entities/content-target.entity';
import { PlatformAccount } from '@pugying/platform-account/domain/entities/platform-account.entity';
import { ContentEntitySchema } from '@pugying/content/infrastructure/typeorm/content.entity-schema';
import { ContentTargetEntitySchema } from '@pugying/content/infrastructure/typeorm/content-target.entity-schema';
import { PlatformAccountEntitySchema } from '@pugying/platform-account/infrastructure/typeorm/platform-account.entity-schema';

describe('个人单机版领域边界', () => {
  it('内容、分发目标和平台账号均不再携带团队字段', () => {
    for (const entity of [
      new Content(),
      new ContentTarget(),
      new PlatformAccount(),
    ]) {
      expect('teamId' in entity).toBe(false);
    }
  });

  it('持久化 schema 不再定义团队列', () => {
    for (const schema of [
      ContentEntitySchema,
      ContentTargetEntitySchema,
      PlatformAccountEntitySchema,
    ]) {
      expect(schema.options.columns).not.toHaveProperty('teamId');
    }
  });

  it('Content 使用 mediaPaths 与封面 BLOB 列', () => {
    const columns = ContentEntitySchema.options.columns as Record<
      string,
      unknown
    >;
    expect(columns).toHaveProperty('mediaPaths');
    expect(columns).toHaveProperty('coverData');
    expect(columns).toHaveProperty('coverLandscapeData');
    expect(columns).not.toHaveProperty('mediaUrls');
    expect(columns).not.toHaveProperty('coverUrl');
  });
});
