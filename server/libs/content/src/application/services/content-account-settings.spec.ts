import { ContentService } from './content.service';
import type { Content } from '../../domain/entities/content.entity';
import type { ContentTarget } from '../../domain/entities/content-target.entity';

describe('图文账号设置保存与恢复', () => {
  it('retains each account declaration and false saving permission when reloaded, and resets them on update', async () => {
    let content: Content;
    let targets: ContentTarget[] = [];
    const contents = {
      create: jest.fn((data) => ({ ...data, id: 'content' })),
      save: jest.fn(async (value) => {
        content = value;
        return value;
      }),
      findById: jest.fn(async () => content),
    };
    const targetRepository = {
      findByContent: jest.fn(async () => targets),
      deleteByContent: jest.fn(async () => {
        targets = [];
      }),
      create: jest.fn((data) => ({ ...data, id: data.platformAccountId })),
      saveMany: jest.fn(async (rows) => {
        targets = rows;
        return rows;
      }),
    };
    const accounts = { findById: jest.fn(async (id) => ({ id, platform: 'douyin', displayName: id })) };
    const service = new ContentService(contents as never, targetRepository as never, accounts as never);
    await service.create({
      type: 'graphic',
      title: '标题',
      body: '描述',
      targets: [
        { platformAccountId: 'account-a', overrides: { authorDeclaration: 'ai_generated', allowDownload: false } },
        { platformAccountId: 'account-b', overrides: { authorDeclaration: 'personal_opinion', allowDownload: true } },
      ],
    });
    const loaded = await service.findById('content');
    expect(loaded.targets[0].overrides).toEqual({ authorDeclaration: 'ai_generated', allowDownload: false });
    expect(loaded.targets[1].overrides).toEqual({ authorDeclaration: 'personal_opinion', allowDownload: true });
    const reset = await service.update('content', {
      targets: [{ platformAccountId: 'account-a', overrides: { authorDeclaration: 'none', allowDownload: true } }],
    });
    expect(reset.targets[0].overrides).toEqual({ authorDeclaration: 'none', allowDownload: true });
  });
});

describe('文章账号设置保存与恢复', () => {
  it('keeps per-platform fields isolated and preserves explicit false values', async () => {
    let content: Content;
    let targets: ContentTarget[] = [];
    const contents = {
      create: jest.fn((data) => ({ ...data, id: 'content' })),
      save: jest.fn(async (value) => {
        content = value;
        return value;
      }),
      findById: jest.fn(async () => content),
    };
    const repository = {
      findByContent: jest.fn(async () => targets),
      deleteByContent: jest.fn(async () => {
        targets = [];
      }),
      create: jest.fn((data) => ({ ...data, id: data.platformAccountId })),
      saveMany: jest.fn(async (rows) => {
        targets = rows;
        return rows;
      }),
    };
    const accounts = { findById: jest.fn(async (id) => ({ id, platform: id, displayName: id })) };
    const service = new ContentService(contents as never, repository as never, accounts as never);
    const settings = {
      summary: '摘要',
      original: true,
      comments: 'closed' as const,
      allowReward: false,
      syncToMicroPost: false,
      declarations: ['ai' as const],
    };
    await service.create({
      type: 'article',
      title: '文章',
      body: '<p>正文</p>',
      targets: ['douyin', 'bilibili', 'toutiao'].map((platformAccountId) => ({ platformAccountId, overrides: { articleSettings: settings } })),
    });
    const loaded = await service.findById('content');
    expect(loaded.targets[0].overrides.articleSettings).toEqual({ summary: '摘要' });
    expect(loaded.targets[1].overrides.articleSettings).toEqual({ comments: 'closed', original: true, customCover: false });
    expect(loaded.targets[2].overrides.articleSettings).toEqual({
      coverMode: 'single',
      advertisement: false,
      exclusive: false,
      allowReward: false,
      syncToMicroPost: false,
      declarations: ['ai'],
    });
    const reset = await service.update('content', { targets: [{ platformAccountId: 'bilibili', overrides: { articleSettings: {} } }] });
    expect(reset.targets[0].overrides.articleSettings).toEqual({ comments: 'open', original: false, customCover: false });
  });
});
