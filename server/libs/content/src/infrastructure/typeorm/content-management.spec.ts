import { DataSource } from 'typeorm';
import { Content } from '../../domain/entities/content.entity';
import { ContentTarget } from '../../domain/entities/content-target.entity';
import type { TargetPublishStatus } from '../../domain/content-types';
import { ContentEntitySchema } from './content.entity-schema';
import { ContentTargetEntitySchema } from './content-target.entity-schema';
import { TypeOrmContentRepository } from './content.repository';
import { TypeOrmContentTargetRepository } from './content-target.repository';
import { ContentService } from '../../application/services/content.service';
import type { IPlatformAccountRepository } from '@pugying/platform-account';

describe('content management queries', () => {
  let source: DataSource;
  let repository: TypeOrmContentRepository;
  let service: ContentService;
  beforeEach(async () => {
    source = await new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [ContentEntitySchema, ContentTargetEntitySchema],
      synchronize: true,
    }).initialize();
    repository = new TypeOrmContentRepository(source.getRepository(Content), source);
    service = new ContentService(repository, new TypeOrmContentTargetRepository(source.getRepository(ContentTarget), source), { findAll: jest.fn().mockResolvedValue([]) } as unknown as IPlatformAccountRepository);
  });
  afterEach(async () => {
    await source.destroy();
  });

  async function add(title: string, states: TargetPublishStatus[], status: 'draft' | 'published' = 'published', type: 'article' | 'video' = 'video') {
    const content = await repository.save(repository.create({ title, status, type, tags: ['测试'], mediaPaths: [] }));
    for (const publishStatus of states) {
      await source
        .getRepository(ContentTarget)
        .save(
          source
            .getRepository(ContentTarget)
            .create({ contentId: content.id, platformAccountId: crypto.randomUUID(), platform: 'douyin', publishStatus, overrides: {} }),
        );
    }
    return content;
  }

  it('classifies mixed targets before pagination and never counts a started publication as completed', async () => {
    await add('草稿', ['idle'], 'draft');
    await add('无账号草稿', [], 'draft');
    await add('待发布', []);
    await add('部分完成', ['succeeded', 'idle']);
    await add('发布中', ['succeeded', 'failed', 'queued']);
    await add('运行中', ['running']);
    await add('失败', ['failed']);
    await add('取消', ['cancelled']);
    await add('混合', ['succeeded', 'failed']);
    await add('完成', ['succeeded', 'succeeded']);
    // 历史内容草稿标记不能覆盖真实的 Target 成功结果。
    await add('历史完成', ['succeeded'], 'draft');
    const removed = await add('已删除', ['failed']);
    await repository.remove(removed);
    const result = await repository.findPaged({ managementStatus: 'needs_attention', pageSize: 2 });
    expect(result.total).toBe(3);
    expect(result.rows).toHaveLength(2);
    expect(result.counts).toEqual({ all: 11, draft: 2, pending: 2, publishing: 2, needs_attention: 3, completed: 2 });
    expect((await repository.findPaged({ managementStatus: 'needs_attention', page: 2, pageSize: 2 })).rows).toHaveLength(1);
    expect((await repository.findPaged({ managementStatus: 'completed' })).rows.map((row) => row.title).sort()).toEqual(['历史完成', '完成'].sort());
  });

  it('keeps counts scoped to type and literal keyword but independent of status or current page', async () => {
    await add('计划_100%', ['failed'], 'published', 'article');
    await add('计划A100X', ['succeeded'], 'published', 'article');
    await add('计划_100%', ['running']);
    const result = await service.findAll('article', '_100%', 3, 1, 'needs_attention');
    expect(result.items).toEqual([]);
    expect(result.total).toBe(1);
    expect(result.counts).toEqual({ all: 1, draft: 0, pending: 0, publishing: 0, needs_attention: 1, completed: 0 });
    const detail = await service.findAll('article', '_100%', 1, 1, 'needs_attention');
    expect(detail.items[0].targets[0].publishStatus).toBe('failed');
    expect(detail.items[0]).not.toHaveProperty('coverData');
  });

  it('rejects invalid status and pagination instead of silently returning all content', async () => {
    await expect(service.findAll(undefined, undefined, 1, 20, 'unknown')).rejects.toThrow('作品状态无效');
    await expect(service.findAll(undefined, undefined, 0)).rejects.toThrow();
    await expect(service.findAll(undefined, undefined, 1, 101)).rejects.toThrow();
  });

  it('observes tasks across content types with global counts, pagination and no idle or deleted work', async () => {
    const running = await add('文章分发', ['running', 'failed', 'idle'], 'published', 'article');
    await add('视频分发', ['running', 'queued']);
    await add('另一条失败', ['failed']);
    await add('仅有草稿', ['idle'], 'draft');
    const removed = await add('已删除任务', ['running', 'failed']);
    await repository.remove(removed);
    const result = await service.findDistributions('active', 1, 1);
    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(1);
    expect(result.counts).toEqual({ active: 2, waiting: 1, attention: 2, completed: 0 });
    const pages = [...result.items, ...(await service.findDistributions('active', 2, 1)).items];
    expect(new Set(pages.map((row) => row.targetId)).size).toBe(2);
    const article = pages.find((row) => row.contentId === running.id)!;
    expect(article).toMatchObject({ taskCount: 2, processedCount: 1, accountName: '账号已移除', accountAvailable: false });
    expect(article).not.toHaveProperty('overrides');
    expect(article).not.toHaveProperty('coverData');
  });

  it('limits recent success to 24 hours, serializes UTC dates and leaves all failures visible', async () => {
    const work = await add('发布结果', ['succeeded', 'succeeded', 'failed']);
    const targets = await source.getRepository(ContentTarget).findBy({ contentId: work.id });
    const successes = targets.filter((target) => target.publishStatus === 'succeeded');
    await source.getRepository(ContentTarget).update(successes[0].id, { startedAt: new Date(Date.now() - 60000), finishedAt: new Date() });
    await source.getRepository(ContentTarget).update(successes[1].id, { finishedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) });
    const result = await service.findDistributions('completed');
    expect(result.total).toBe(1);
    expect(result.counts.attention).toBe(1);
    expect(result.items[0].finishedAt).toMatch(/Z$/);
    expect(result.items[0].startedAt).toMatch(/Z$/);
    expect(result.items[0]).toMatchObject({ processedCount: 3, taskCount: 3 });
    await expect(service.findDistributions('unknown')).rejects.toThrow('分发筛选条件无效');
    await expect(service.findDistributions('active', 0)).rejects.toThrow();
    await expect(service.findDistributions('active', 1, 101)).rejects.toThrow();
  });
});
