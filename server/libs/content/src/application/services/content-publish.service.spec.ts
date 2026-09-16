import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { encryptCredentialPayload } from '@pugying/platform-account/infrastructure/credential-crypto';
import { PlatformAccount } from '@pugying/platform-account';
import { Content } from '@pugying/content/domain/entities/content.entity';
import { ContentTarget } from '@pugying/content/domain/entities/content-target.entity';
import { ContentPublishService } from './content-publish.service';

const CONTENT_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_ID = '22222222-2222-4222-8222-222222222222';
const ACCOUNT_ID = '33333333-3333-4333-8333-333333333333';

const JPEG_STUB = Buffer.from([
  0xff, 0xd8, 0xff, 0xd9, // 最小 JPEG 标记
]);

let videoPath = '';
let tempRoot = '';

function createVideo(overrides: Partial<Content> = {}): Content {
  return Object.assign(new Content(), {
    id: CONTENT_ID,
    type: 'video',
    title: '测试视频',
    body: '简介',
    coverMime: 'image/jpeg',
    coverData: JPEG_STUB,
    coverLandscapeMime: 'image/jpeg',
    coverLandscapeData: JPEG_STUB,
    mediaPaths: [videoPath],
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
    contentId: CONTENT_ID,
    platformAccountId: ACCOUNT_ID,
    platform: 'douyin',
    overrides: {},
    coverMime: null,
    coverData: null,
    coverLandscapeMime: null,
    coverLandscapeData: null,
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

describe('ContentPublishService', () => {
  let contents: {
    findByIdWithCovers: jest.Mock;
    save: jest.Mock;
  };
  let targets: {
    findById: jest.Mock;
    findByIdWithCovers: jest.Mock;
    findByContent: jest.Mock;
    save: jest.Mock;
    saveMany: jest.Mock;
  };
  let accounts: { findById: jest.Mock; save: jest.Mock };
  let service: ContentPublishService;

  beforeAll(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'pugying-publish-spec-'));
    videoPath = join(tempRoot, 'sample.mp4');
    await writeFile(videoPath, Buffer.from('fake-mp4'));
  });

  afterAll(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  beforeEach(() => {
    contents = {
      findByIdWithCovers: jest.fn(),
      save: jest.fn(async (c: Content) => c),
    };
    targets = {
      findById: jest.fn(),
      findByIdWithCovers: jest.fn(async (id: string) =>
        createTarget({ id, publishStatus: 'queued' }),
      ),
      findByContent: jest.fn(),
      save: jest.fn(async (t: ContentTarget) => t),
      saveMany: jest.fn(async (rows: ContentTarget[]) => rows),
    };
    accounts = {
      findById: jest.fn().mockResolvedValue(createAccount()),
      save: jest.fn(async (a: PlatformAccount) => a),
    };
    service = new ContentPublishService(
      contents as never,
      targets as never,
      accounts as never,
    );
  });

  describe('publish', () => {
    it('queues eligible targets and returns local-path dispatches', async () => {
      const content = createVideo();
      const target = createTarget();
      contents.findByIdWithCovers.mockResolvedValue(content);
      targets.findByContent
        .mockResolvedValueOnce([target])
        .mockResolvedValueOnce([{ ...target, publishStatus: 'queued' }]);
      targets.findByIdWithCovers.mockResolvedValue(target);

      const result = await service.publish(CONTENT_ID);

      expect(targets.saveMany).toHaveBeenCalled();
      expect(result.dispatches).toHaveLength(1);
      expect(result.dispatches[0]).toMatchObject({
        targetId: TARGET_ID,
        platform: 'douyin',
        accountId: ACCOUNT_ID,
        title: '测试视频',
        mediaPath: videoPath,
      });
      expect(result.dispatches[0].coverPath).toBeTruthy();
      expect(result.dispatches[0].coverLandscapePath).toBeTruthy();
      expect(result.dispatches[0].cookies[0].name).toBe('sessionid');
      expect(contents.save).toHaveBeenCalled();
      expect(content.status).toBe('published');
    });

    it('rejects when a job is already running', async () => {
      contents.findByIdWithCovers.mockResolvedValue(createVideo());
      targets.findByContent.mockResolvedValue([
        createTarget({ publishStatus: 'running' }),
      ]);
      await expect(service.publish(CONTENT_ID)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rejects missing cover', async () => {
      contents.findByIdWithCovers.mockResolvedValue(
        createVideo({ coverMime: null, coverData: null }),
      );
      await expect(service.publish(CONTENT_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects missing landscape cover', async () => {
      contents.findByIdWithCovers.mockResolvedValue(
        createVideo({ coverLandscapeMime: null, coverLandscapeData: null }),
      );
      await expect(service.publish(CONTENT_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('start / complete / cancel / retry', () => {
    it('starts a queued target', async () => {
      const content = createVideo();
      const target = createTarget({ publishStatus: 'queued' });
      contents.findByIdWithCovers.mockResolvedValue(content);
      targets.findById.mockResolvedValue(target);
      targets.findByIdWithCovers.mockResolvedValue(target);

      const result = await service.startTarget(CONTENT_ID, TARGET_ID);
      expect(result.target.publishStatus).toBe('running');
      expect(result.target.startedAt).toBeInstanceOf(Date);
      expect(result.dispatch.mediaPath).toBe(videoPath);
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
      const content = createVideo();
      const target = createTarget({ publishStatus: 'failed' });
      contents.findByIdWithCovers.mockResolvedValue(content);
      targets.findById.mockResolvedValue(target);
      targets.findByContent.mockResolvedValue([target]);
      targets.findByIdWithCovers.mockResolvedValue(target);
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
