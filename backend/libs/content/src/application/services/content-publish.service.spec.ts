import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { encryptCredentialPayload } from '@pugying/platform-account/infrastructure/credential-crypto';
import { PlatformAccount } from '@pugying/platform-account';
import { Content } from '@pugying/content/domain/entities/content.entity';
import { ContentTarget } from '@pugying/content/domain/entities/content-target.entity';
import {
  ContentPublishService,
  parseMediaAssetId,
} from './content-publish.service';

const TEAM = 'team-a';
const CONTENT_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_ID = '22222222-2222-4222-8222-222222222222';
const ACCOUNT_ID = '33333333-3333-4333-8333-333333333333';
const VIDEO_ASSET = '44444444-4444-4444-8444-444444444444';
const COVER_ASSET = '55555555-5555-4555-8555-555555555555';
const COVER_LANDSCAPE_ASSET = '66666666-6666-4666-8666-666666666666';

function createVideo(overrides: Partial<Content> = {}): Content {
  return Object.assign(new Content(), {
    id: CONTENT_ID,
    teamId: TEAM,
    type: 'video',
    title: '测试视频',
    body: '简介',
    coverUrl: `/media/assets/${COVER_ASSET}`,
    coverLandscapeUrl: `/media/assets/${COVER_LANDSCAPE_ASSET}`,
    mediaUrls: [`/media/assets/${VIDEO_ASSET}`],
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

function createTarget(overrides: Partial<ContentTarget> = {}): ContentTarget {
  return Object.assign(new ContentTarget(), {
    id: TARGET_ID,
    teamId: TEAM,
    contentId: CONTENT_ID,
    platformAccountId: ACCOUNT_ID,
    platform: 'douyin',
    overrides: {},
    publishStatus: 'idle',
    platformPostId: null,
    platformUrl: null,
    errorCode: null,
    errorMessage: null,
    startedAt: null,
    finishedAt: null,
    ...overrides,
  });
}

function createAccount(overrides: Partial<PlatformAccount> = {}): PlatformAccount {
  return Object.assign(new PlatformAccount(), {
    id: ACCOUNT_ID,
    teamId: TEAM,
    platform: 'douyin',
    displayName: '抖音号',
    status: 'active',
    credentialCipher: encryptCredentialPayload(
      JSON.stringify({
        cookies: [{ name: 'sessionid', value: 'abc', domain: '.douyin.com' }],
      }),
    ),
    ...overrides,
  });
}

describe('parseMediaAssetId', () => {
  it('parses path and bare uuid', () => {
    expect(parseMediaAssetId(`/media/assets/${VIDEO_ASSET}`)).toBe(VIDEO_ASSET);
    expect(parseMediaAssetId(VIDEO_ASSET)).toBe(VIDEO_ASSET);
    expect(parseMediaAssetId('https://cdn.example/x.mp4')).toBeNull();
  });
});

describe('ContentPublishService', () => {
  let contents: {
    findById: jest.Mock;
    save: jest.Mock;
  };
  let targets: {
    findById: jest.Mock;
    findByContent: jest.Mock;
    save: jest.Mock;
    saveMany: jest.Mock;
  };
  let accounts: { findById: jest.Mock };
  let media: { createSignedDownloadUrlForTeam: jest.Mock };
  let service: ContentPublishService;

  beforeEach(() => {
    contents = {
      findById: jest.fn(),
      save: jest.fn(async (c: Content) => c),
    };
    targets = {
      findById: jest.fn(),
      findByContent: jest.fn(),
      save: jest.fn(async (t: ContentTarget) => t),
      saveMany: jest.fn(async (rows: ContentTarget[]) => rows),
    };
    accounts = {
      findById: jest.fn().mockResolvedValue(createAccount()),
      save: jest.fn(async (a: PlatformAccount) => a),
    };
    media = {
      createSignedDownloadUrlForTeam: jest.fn(async (id: string) => ({
        url: `http://media.test/media/assets/${id}/download?exp=1&sig=x`,
        expiresAt: 1,
      })),
    };
    service = new ContentPublishService(
      contents as never,
      targets as never,
      accounts as never,
      media as never,
    );
  });

  describe('publish', () => {
    it('queues eligible targets and returns dispatches', async () => {
      const content = createVideo();
      const target = createTarget();
      contents.findById.mockResolvedValue(content);
      targets.findByContent
        .mockResolvedValueOnce([target])
        .mockResolvedValueOnce([{ ...target, publishStatus: 'queued' }]);

      const result = await service.publish(CONTENT_ID);

      expect(targets.saveMany).toHaveBeenCalled();
      expect(result.dispatches).toHaveLength(1);
      expect(result.dispatches[0]).toMatchObject({
        targetId: TARGET_ID,
        platform: 'douyin',
        accountId: ACCOUNT_ID,
        title: '测试视频',
      });
      expect(result.dispatches[0].cookies[0].name).toBe('sessionid');
      expect(contents.save).toHaveBeenCalled();
      expect(content.status).toBe('published');
    });

    it('rejects when a job is already running', async () => {
      contents.findById.mockResolvedValue(createVideo());
      targets.findByContent.mockResolvedValue([
        createTarget({ publishStatus: 'running' }),
      ]);
      await expect(service.publish(CONTENT_ID)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rejects missing cover', async () => {
      contents.findById.mockResolvedValue(createVideo({ coverUrl: null }));
      await expect(service.publish(CONTENT_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects missing landscape cover', async () => {
      contents.findById.mockResolvedValue(
        createVideo({ coverLandscapeUrl: null }),
      );
      await expect(service.publish(CONTENT_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('start / complete / cancel / retry', () => {
    it('starts a queued target', async () => {
      contents.findById.mockResolvedValue(createVideo());
      targets.findById.mockResolvedValue(createTarget({ publishStatus: 'queued' }));

      const result = await service.startTarget(CONTENT_ID, TARGET_ID);
      expect(result.target.publishStatus).toBe('running');
      expect(result.target.startedAt).toBeInstanceOf(Date);
      expect(result.dispatch.mediaUrl).toContain(VIDEO_ASSET);
    });

    it('completes success and failure', async () => {
      targets.findById.mockResolvedValue(
        createTarget({ publishStatus: 'running', startedAt: new Date() }),
      );
      const ok = await service.completeTarget(CONTENT_ID, TARGET_ID, {
        ok: true,
        platformPostId: 'p1',
        platformUrl: 'https://douyin.com/v/1',
      });
      expect(ok.publishStatus).toBe('succeeded');

      targets.findById.mockResolvedValue(
        createTarget({ publishStatus: 'running', startedAt: new Date() }),
      );
      const fail = await service.completeTarget(CONTENT_ID, TARGET_ID, {
        ok: false,
        errorCode: 'AUTH_EXPIRED',
        errorMessage: '登录失效',
      });
      expect(fail.publishStatus).toBe('failed');
      expect(fail.errorCode).toBe('AUTH_EXPIRED');
      expect(accounts.findById).toHaveBeenCalledWith(ACCOUNT_ID);
      expect(accounts.save).toHaveBeenCalled();
      expect(accounts.save.mock.calls[0][0].status).toBe('expired');
    });

    it('cancels queued target', async () => {
      targets.findById.mockResolvedValue(createTarget({ publishStatus: 'queued' }));
      const cancelled = await service.cancelTarget(CONTENT_ID, TARGET_ID);
      expect(cancelled.publishStatus).toBe('cancelled');
    });

    it('retries failed target', async () => {
      contents.findById.mockResolvedValue(createVideo());
      targets.findById.mockResolvedValue(createTarget({ publishStatus: 'failed' }));
      targets.findByContent.mockResolvedValue([
        createTarget({ publishStatus: 'failed' }),
      ]);
      const result = await service.retryTarget(CONTENT_ID, TARGET_ID);
      expect(result.target.publishStatus).toBe('queued');
      expect(result.dispatch.targetId).toBe(TARGET_ID);
    });

    it('throws NotFound for unknown target', async () => {
      targets.findById.mockResolvedValue(null);
      await expect(
        service.cancelTarget(CONTENT_ID, TARGET_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
