import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { CurrentTeam } from '@pugying/core';
import { PlatformAccount } from '@pugying/platform-account';
import { Content } from '@pugying/content/domain/entities/content.entity';
import { ContentTarget } from '@pugying/content/domain/entities/content-target.entity';
import { ContentService } from './content.service';

const TEAM_A = 'team-a';
const TEAM_B = 'team-b';
const ACCOUNT_DOUYIN = 'account-douyin';
const ACCOUNT_BILIBILI = 'account-bilibili';

class FakeCurrentTeam {
  id: string | null = null;

  get isAvailable(): boolean {
    return this.id !== null;
  }
}

function createContent(overrides: Partial<Content> = {}): Content {
  return Object.assign(new Content(), {
    id: 'content-1',
    teamId: TEAM_A,
    type: 'article',
    title: '标题',
    body: null,
    coverUrl: null,
    coverLandscapeUrl: null,
    mediaUrls: [],
    status: 'draft',
    publishedAt: null,
    tags: [],
    location: null,
    visibility: 'public',
    scheduledAt: null,
    allowDownload: true,
    ...overrides,
  });
}

function createAccount(id: string, platform: string): PlatformAccount {
  return Object.assign(new PlatformAccount(), {
    id,
    teamId: TEAM_A,
    platform,
    displayName: `${platform} 账号`,
    status: 'active',
  });
}

describe('ContentService', () => {
  let repository: any;
  let targetRepository: any;
  let platformAccountRepository: any;
  let currentTeam: FakeCurrentTeam;
  let service: ContentService;

  beforeEach(() => {
    repository = {
      create: jest.fn((data: Partial<Content>) => Object.assign(new Content(), { id: 'content-1' }, data)),
      findAllForCurrentTeam: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(null),
      save: jest.fn(async (content: Content) => content),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    targetRepository = {
      create: jest.fn((data: Partial<ContentTarget>) => Object.assign(new ContentTarget(), data)),
      findByContent: jest.fn().mockResolvedValue([]),
      findByContents: jest.fn().mockResolvedValue([]),
      saveMany: jest.fn(async (targets: ContentTarget[]) => targets),
      deleteByContent: jest.fn().mockResolvedValue(undefined),
    };
    platformAccountRepository = {
      findById: jest.fn(async (id: string) => {
        if (id === ACCOUNT_DOUYIN) {
          return createAccount(ACCOUNT_DOUYIN, 'douyin');
        }
        if (id === ACCOUNT_BILIBILI) {
          return createAccount(ACCOUNT_BILIBILI, 'bilibili');
        }
        return null;
      }),
    };
    currentTeam = new FakeCurrentTeam();
    currentTeam.id = TEAM_A;
    service = new ContentService(repository, targetRepository, platformAccountRepository, currentTeam as unknown as CurrentTeam);
  });

  describe('findAll', () => {
    it('rejects unsupported type filters', async () => {
      await expect(service.findAll('audio')).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.findAllForCurrentTeam).not.toHaveBeenCalled();
    });

    it('returns [] without querying targets when there is no content', async () => {
      await expect(service.findAll()).resolves.toEqual([]);
      expect(targetRepository.findByContents).not.toHaveBeenCalled();
    });

    it('passes the type filter to the repository', async () => {
      await service.findAll('video');

      expect(repository.findAllForCurrentTeam).toHaveBeenCalledWith({
        type: 'video',
        q: undefined,
      });
    });

    it('passes the keyword filter to the repository', async () => {
      await service.findAll(undefined, '封面');

      expect(repository.findAllForCurrentTeam).toHaveBeenCalledWith({
        type: undefined,
        q: '封面',
      });
    });

    it('groups targets by content id', async () => {
      repository.findAllForCurrentTeam.mockResolvedValue([createContent({ id: 'content-1' }), createContent({ id: 'content-2' })]);
      targetRepository.findByContents.mockResolvedValue([
        Object.assign(new ContentTarget(), {
          id: 'target-1',
          contentId: 'content-1',
        }),
        Object.assign(new ContentTarget(), {
          id: 'target-2',
          contentId: 'content-1',
        }),
      ]);

      const rows = await service.findAll();

      expect(targetRepository.findByContents).toHaveBeenCalledWith(['content-1', 'content-2']);
      expect(rows[0].targets.map((target) => target.id)).toEqual(['target-1', 'target-2']);
      expect(rows[1].targets).toEqual([]);
    });
  });

  describe('findById', () => {
    it('throws NotFoundException for unknown content', async () => {
      await expect(service.findById('missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('attaches the content targets', async () => {
      repository.findById.mockResolvedValue(createContent());
      const target = Object.assign(new ContentTarget(), {
        id: 'target-1',
        contentId: 'content-1',
      });
      targetRepository.findByContent.mockResolvedValue([target]);

      const content = await service.findById('content-1');

      expect(content.targets).toEqual([target]);
    });
  });

  describe('create', () => {
    it('rejects creation outside of a team context', async () => {
      currentTeam.id = null;

      await expect(service.create({ type: 'article', title: '标题' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects unsupported content types', async () => {
      await expect(service.create({ type: 'audio', title: '标题' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('stamps the current team and applies defaults', async () => {
      const content = await service.create({
        type: 'article',
        title: '  标题  ',
        body: '   ',
        mediaUrls: [' https://img.example.com/1.png ', '  '],
        tags: [' 旅行 ', ''],
      });

      expect(content.teamId).toBe(TEAM_A);
      expect(content.title).toBe('标题');
      expect(content.body).toBeNull();
      expect(content.mediaUrls).toEqual(['https://img.example.com/1.png']);
      expect(content.tags).toEqual(['旅行']);
      expect(content.status).toBe('draft');
      expect(content.visibility).toBe('public');
      expect(content.publishedAt).toBeNull();
      expect(content.scheduledAt).toBeNull();
      expect(content.allowDownload).toBe(true);
      expect(content.targets).toEqual([]);
    });

    it('sets publishedAt when created as published', async () => {
      const content = await service.create({
        type: 'video',
        title: '视频',
        status: 'published',
      });

      expect(content.status).toBe('published');
      expect(content.publishedAt).toBeInstanceOf(Date);
    });

    it('rejects an invalid scheduledAt value', async () => {
      await expect(
        service.create({
          type: 'article',
          title: '标题',
          scheduledAt: 'not-a-date',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects targets that reference unknown platform accounts', async () => {
      await expect(
        service.create({
          type: 'article',
          title: '标题',
          targets: [{ platformAccountId: 'account-missing' }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('deduplicates targets and stamps team and platform on each', async () => {
      const content = await service.create({
        type: 'article',
        title: '标题',
        targets: [
          {
            platformAccountId: ACCOUNT_DOUYIN,
            overrides: {
              title: '  抖音标题  ',
              tags: [' 抖音 ', ' '],
              scheduledAt: '2026-08-01T10:00:00.000Z',
            },
          },
          { platformAccountId: ACCOUNT_DOUYIN },
          { platformAccountId: ACCOUNT_BILIBILI },
        ],
      });

      expect(content.targets).toHaveLength(2);
      const [douyin, bilibili] = content.targets;
      expect(douyin.contentId).toBe('content-1');
      expect(douyin.teamId).toBe(TEAM_A);
      expect(douyin.platform).toBe('douyin');
      expect(douyin.overrides).toEqual({
        title: '抖音标题',
        tags: ['抖音'],
        scheduledAt: '2026-08-01T10:00:00.000Z',
      });
      expect(bilibili.platform).toBe('bilibili');
      expect(bilibili.overrides).toEqual({});
      expect(targetRepository.deleteByContent).toHaveBeenCalledWith('content-1');
    });
  });

  describe('update', () => {
    it('throws NotFoundException for unknown content', async () => {
      await expect(service.update('missing', { title: '新标题' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('applies partial field updates only', async () => {
      repository.findById.mockResolvedValue(createContent({ body: '原正文', tags: ['原标签'] }));

      const content = await service.update('content-1', {
        title: '  新标题  ',
        body: '',
      });

      expect(content.title).toBe('新标题');
      expect(content.body).toBeNull();
      expect(content.tags).toEqual(['原标签']);
    });

    it('sets publishedAt when publishing a draft', async () => {
      repository.findById.mockResolvedValue(createContent());

      const content = await service.update('content-1', {
        status: 'published',
      });

      expect(content.status).toBe('published');
      expect(content.publishedAt).toBeInstanceOf(Date);
    });

    it('clears publishedAt when reverting to draft', async () => {
      repository.findById.mockResolvedValue(createContent({ status: 'published', publishedAt: new Date() }));

      const content = await service.update('content-1', { status: 'draft' });

      expect(content.status).toBe('draft');
      expect(content.publishedAt).toBeNull();
    });

    it('keeps existing targets when the dto omits them', async () => {
      repository.findById.mockResolvedValue(createContent());
      const target = Object.assign(new ContentTarget(), {
        id: 'target-1',
        contentId: 'content-1',
      });
      targetRepository.findByContent.mockResolvedValue([target]);

      const content = await service.update('content-1', { title: '新标题' });

      expect(content.targets).toEqual([target]);
      expect(targetRepository.deleteByContent).not.toHaveBeenCalled();
    });

    it('replaces targets using the content own team, not the request team', async () => {
      // Content belongs to TEAM_B while the request runs under TEAM_A:
      // prepared targets must stay in the content's team.
      repository.findById.mockResolvedValue(createContent({ teamId: TEAM_B }));

      const content = await service.update('content-1', {
        targets: [{ platformAccountId: ACCOUNT_DOUYIN }],
      });

      expect(targetRepository.deleteByContent).toHaveBeenCalledWith('content-1');
      expect(content.targets).toHaveLength(1);
      expect(content.targets[0].teamId).toBe(TEAM_B);
    });

    it('clears all targets when an empty list is provided', async () => {
      repository.findById.mockResolvedValue(createContent());

      const content = await service.update('content-1', { targets: [] });

      expect(targetRepository.deleteByContent).toHaveBeenCalledWith('content-1');
      expect(targetRepository.saveMany).not.toHaveBeenCalled();
      expect(content.targets).toEqual([]);
    });
  });

  describe('remove', () => {
    it('throws NotFoundException for unknown content', async () => {
      await expect(service.remove('missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('deletes targets before removing the content', async () => {
      const content = createContent();
      repository.findById.mockResolvedValue(content);

      await service.remove('content-1');

      expect(targetRepository.deleteByContent).toHaveBeenCalledWith('content-1');
      expect(repository.remove).toHaveBeenCalledWith(content);
    });
  });
});
