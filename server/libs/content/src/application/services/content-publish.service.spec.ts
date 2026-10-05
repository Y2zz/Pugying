import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { mkdtemp, writeFile, readFile, rm } from 'fs/promises';
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
  0xff,
  0xd8,
  0xff,
  0xd9, // 最小 JPEG 标记
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
      findByIdWithCovers: jest.fn(async (id: string) => createTarget({ id, publishStatus: 'queued' })),
      findByContent: jest.fn(),
      save: jest.fn(async (t: ContentTarget) => t),
      saveMany: jest.fn(async (rows: ContentTarget[]) => rows),
    };
    accounts = {
      findById: jest.fn().mockResolvedValue(createAccount()),
      save: jest.fn(async (a: PlatformAccount) => a),
    };
    service = new ContentPublishService(contents as never, targets as never, accounts as never);
  });

  describe('publish', () => {
    it('queues eligible targets and returns local-path dispatches', async () => {
      const content = createVideo();
      const target = createTarget();
      contents.findByIdWithCovers.mockResolvedValue(content);
      targets.findByContent.mockResolvedValueOnce([target]).mockResolvedValueOnce([{ ...target, publishStatus: 'queued' }]);
      targets.findByIdWithCovers.mockResolvedValue(target);

      const result = await service.publish(CONTENT_ID);

      expect(targets.saveMany).toHaveBeenCalled();
      expect(result.dispatches).toHaveLength(1);
      expect(result.dispatches[0]).toMatchObject({
        targetId: TARGET_ID,
        platform: 'douyin',
        accountId: ACCOUNT_ID,
        contentType: 'video',
        title: '测试视频',
        mediaPath: videoPath,
        mediaPaths: [videoPath],
      });
      expect(result.dispatches[0].coverPath).toBeTruthy();
      expect(result.dispatches[0].coverLandscapePath).toBeTruthy();
      expect(result.dispatches[0].cookies[0].name).toBe('sessionid');
      expect(contents.save).toHaveBeenCalled();
      expect(content.status).toBe('published');
    });

    it('dispatches video without custom covers and retains the account declaration', async () => {
      const content = createVideo({ coverMime: null, coverData: null, coverLandscapeMime: null, coverLandscapeData: null });
      const target = createTarget({ overrides: { authorDeclaration: 'ai_generated' } });
      contents.findByIdWithCovers.mockResolvedValue(content);
      targets.findByContent.mockResolvedValueOnce([target]).mockResolvedValueOnce([{ ...target, publishStatus: 'queued' }]);
      targets.findByIdWithCovers.mockResolvedValue(target);
      const result = await service.publish(CONTENT_ID);
      expect(result.dispatches[0]).toMatchObject({ contentType: 'video', coverPath: '', coverLandscapePath: '', authorDeclaration: 'ai_generated' });
    });

    it('dispatches a Bilibili article without custom cover and retains account settings', async () => {
      const content = createVideo({
        type: 'article',
        body: '<p>正文</p>',
        mediaPaths: [],
        coverMime: null,
        coverData: null,
        coverLandscapeMime: null,
        coverLandscapeData: null,
      });
      const target = createTarget({ platform: 'bilibili', overrides: { visibility: 'private', articleSettings: { comments: 'selected', original: false } } });
      accounts.findById.mockResolvedValue(createAccount({ platform: 'bilibili' }));
      contents.findByIdWithCovers.mockResolvedValue(content);
      targets.findByContent.mockResolvedValueOnce([target]).mockResolvedValueOnce([{ ...target, publishStatus: 'queued' }]);
      targets.findByIdWithCovers.mockResolvedValue(target);
      // 实际发布仍由平台接入白名单控制；这里只验证已保存账号设置的载荷准备。
      const dispatch = await (service as unknown as { buildDispatch(content: Content, target: ContentTarget): Promise<unknown> }).buildDispatch(
        content,
        target,
      );
      expect(dispatch).toMatchObject({
        contentType: 'article',
        coverPath: '',
        coverLandscapePath: '',
        visibility: 'private',
        articleSettings: { comments: 'selected', original: false },
      });
    });

    it.each(['single', 'triple', 'none'] as const)('prepares Toutiao %s covers in order', async (coverMode) => {
      const content = createVideo({ type: 'article', body: '<p>正文</p>', mediaPaths: [] });
      const target = createTarget({
        platform: 'toutiao',
        overrides: { articleSettings: { coverMode } },
        coverLandscape2Mime: 'image/png',
        coverLandscape2Data: Buffer.from('second'),
        coverLandscape3Mime: 'image/jpeg',
        coverLandscape3Data: Buffer.from('third'),
      });
      targets.findByIdWithCovers.mockResolvedValue(target);
      const dispatch = await (
        service as unknown as { buildDispatch(content: Content, target: ContentTarget): Promise<import('./content-publish.service').PublishDispatch> }
      ).buildDispatch(content, target);
      expect(dispatch.articleCoverPaths).toHaveLength(coverMode === 'triple' ? 3 : coverMode === 'single' ? 1 : 0);
      if (coverMode === 'none') {
        expect(dispatch.coverPath).toBe('');
        expect(dispatch.coverLandscapePath).toBe('');
      }
      if (coverMode === 'triple') {
        expect(await Promise.all(dispatch.articleCoverPaths!.map((path) => readFile(path)))).toEqual([JPEG_STUB, Buffer.from('second'), Buffer.from('third')]);
      }
    });

    it('rejects an incomplete Toutiao gallery', async () => {
      const content = createVideo({ type: 'article', body: '<p>正文</p>', mediaPaths: [] });
      const target = createTarget({ platform: 'toutiao', overrides: { articleSettings: { coverMode: 'triple' } } });
      targets.findByIdWithCovers.mockResolvedValue(target);
      await expect(
        (service as unknown as { buildDispatch(content: Content, target: ContentTarget): Promise<unknown> }).buildDispatch(content, target),
      ).rejects.toThrow('三张封面');
    });

    it('Bilibili explicit off suppresses both common and account covers', async () => {
      const content = createVideo({ type: 'article', body: '<p>正文</p>', mediaPaths: [] });
      const target = createTarget({
        platform: 'bilibili',
        coverLandscapeMime: 'image/jpeg',
        coverLandscapeData: JPEG_STUB,
        overrides: { articleSettings: { customCover: false } },
      });
      targets.findByIdWithCovers.mockResolvedValue(target);
      const dispatch = await (service as unknown as { buildDispatch(content: Content, target: ContentTarget): Promise<unknown> }).buildDispatch(
        content,
        target,
      );
      expect(dispatch).toMatchObject({ coverPath: '', coverLandscapePath: '', articleCoverPaths: [] });
    });

    it('validation failure leaves all eligible targets idle and content unpublished', async () => {
      const content = createVideo({ type: 'article', body: '<p>正文</p>', mediaPaths: [] });
      const good = createTarget();
      const bad = createTarget({ id: 'other', overrides: { title: '字'.repeat(31) } });
      contents.findByIdWithCovers.mockResolvedValue(content);
      targets.findByContent.mockResolvedValue([good, bad]);
      targets.findByIdWithCovers.mockImplementation(async (id: string) => (id === good.id ? good : bad));
      await expect(service.publish(CONTENT_ID)).rejects.toThrow('标题最多 30 字');
      expect(targets.saveMany).not.toHaveBeenCalled();
      expect(contents.save).not.toHaveBeenCalled();
      expect(good.publishStatus).toBe('idle');
      expect(bad.publishStatus).toBe('idle');
      expect(content.status).toBe('draft');
    });

    it.each([false, true])('dispatches Douyin article with portrait cover, account override: %s', async (accountCover) => {
      const commonPortrait = Buffer.from('common-portrait');
      const accountPortrait = Buffer.from('account-portrait');
      const content = createVideo({
        type: 'article',
        body: '<p>正文</p>',
        mediaPaths: [],
        coverData: commonPortrait,
        coverLandscapeMime: null,
        coverLandscapeData: null,
      });
      const target = createTarget(accountCover ? { coverMime: 'image/jpeg', coverData: accountPortrait } : {});
      contents.findByIdWithCovers.mockResolvedValue(content);
      targets.findByContent.mockResolvedValueOnce([target]).mockResolvedValueOnce([{ ...target, publishStatus: 'queued' }]);
      targets.findByIdWithCovers.mockResolvedValue(target);
      const result = await service.publish(CONTENT_ID);
      const dispatch = result.dispatches[0];
      expect(dispatch.contentType).toBe('article');
      expect(dispatch.coverLandscapePath).toBe('');
      expect(await readFile(dispatch.coverPath)).toEqual(accountCover ? accountPortrait : commonPortrait);
    });

    it('rejects a Douyin article with only a landscape cover', async () => {
      const content = createVideo({ type: 'article', body: '<p>正文</p>', mediaPaths: [], coverMime: null, coverData: null });
      const target = createTarget();
      contents.findByIdWithCovers.mockResolvedValue(content);
      targets.findByContent.mockResolvedValueOnce([target]).mockResolvedValueOnce([{ ...target, publishStatus: 'queued' }]);
      targets.findByIdWithCovers.mockResolvedValue(target);
      await expect(service.publish(CONTENT_ID)).rejects.toThrow('缺少竖版封面（3:4）');
    });

    it('queues graphic with images and portrait-only cover', async () => {
      const imageA = join(tempRoot, 'a.jpg');
      const imageB = join(tempRoot, 'b.jpg');
      await writeFile(imageA, Buffer.from('img-a'));
      await writeFile(imageB, Buffer.from('img-b'));
      const content = createVideo({
        type: 'graphic',
        title: '测试图文',
        tags: ['通用话题'],
        mediaPaths: [imageA, imageB],
        coverLandscapeMime: null,
        coverLandscapeData: null,
      });
      const target = createTarget({ overrides: { tags: ['账号话题'], visibility: 'private', allowDownload: false, authorDeclaration: 'ai_generated' } });
      contents.findByIdWithCovers.mockResolvedValue(content);
      targets.findByContent.mockResolvedValueOnce([target]).mockResolvedValueOnce([{ ...target, publishStatus: 'queued' }]);
      targets.findByIdWithCovers.mockResolvedValue(target);

      const result = await service.publish(CONTENT_ID);
      expect(result.dispatches[0]).toMatchObject({
        contentType: 'graphic',
        mediaPath: imageA,
        mediaPaths: [imageA, imageB],
        coverLandscapePath: '',
        tags: ['账号话题'],
        visibility: 'private',
        allowDownload: false,
        authorDeclaration: 'ai_generated',
      });
      expect(result.dispatches[0].coverPath).toBeTruthy();
    });

    it('rejects graphic without images', async () => {
      contents.findByIdWithCovers.mockResolvedValue(
        createVideo({
          type: 'graphic',
          mediaPaths: [],
          coverLandscapeMime: null,
          coverLandscapeData: null,
        }),
      );
      await expect(service.publish(CONTENT_ID)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects graphic without portrait cover', async () => {
      contents.findByIdWithCovers.mockResolvedValue(
        createVideo({
          type: 'graphic',
          mediaPaths: [videoPath],
          coverMime: null,
          coverData: null,
          coverLandscapeMime: null,
          coverLandscapeData: null,
        }),
      );
      await expect(service.publish(CONTENT_ID)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when a job is already running', async () => {
      contents.findByIdWithCovers.mockResolvedValue(createVideo());
      targets.findByContent.mockResolvedValue([createTarget({ publishStatus: 'running' })]);
      await expect(service.publish(CONTENT_ID)).rejects.toBeInstanceOf(ConflictException);
    });

    it.each(['portrait', 'landscape'] as const)('accepts video with only %s cover', async (aspect) => {
      const content = createVideo(aspect === 'portrait' ? { coverLandscapeMime: null, coverLandscapeData: null } : { coverMime: null, coverData: null });
      const target = createTarget();
      contents.findByIdWithCovers.mockResolvedValue(content);
      targets.findByContent.mockResolvedValueOnce([target]).mockResolvedValueOnce([{ ...target, publishStatus: 'queued' }]);
      targets.findByIdWithCovers.mockResolvedValue(target);
      const result = await service.publish(CONTENT_ID);
      expect(result.dispatches[0][aspect === 'portrait' ? 'coverPath' : 'coverLandscapePath']).toBeTruthy();
      expect(result.dispatches[0][aspect === 'portrait' ? 'coverLandscapePath' : 'coverPath']).toBe('');
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

    it.each(['queued', 'failed'] as const)('rechecks an expired schedule before changing %s state', async (status) => {
      const content = createVideo({ type: 'article', body: '<p>正文</p>', mediaPaths: [] });
      const target = createTarget({ publishStatus: status, overrides: { scheduledAt: new Date(Date.now() - 60_000).toISOString() } });
      contents.findByIdWithCovers.mockResolvedValue(content);
      targets.findById.mockResolvedValue(target);
      targets.findByContent.mockResolvedValue([target]);
      targets.findByIdWithCovers.mockResolvedValue(target);
      const action = status === 'queued' ? service.startTarget(CONTENT_ID, TARGET_ID) : service.retryTarget(CONTENT_ID, TARGET_ID);
      await expect(action).rejects.toThrow('发布时间');
      expect(targets.save).not.toHaveBeenCalled();
      expect(target.publishStatus).toBe(status);
    });

    it('completes success and failure', async () => {
      targets.findById.mockResolvedValue(createTarget({ publishStatus: 'running', startedAt: new Date() }));
      const ok = await service.completeTarget(CONTENT_ID, TARGET_ID, {
        ok: true,
        platformPostId: 'p1',
        platformUrl: 'https://douyin.com/v/1',
      });
      expect(ok.publishStatus).toBe('succeeded');

      targets.findById.mockResolvedValue(createTarget({ publishStatus: 'running', startedAt: new Date() }));
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
      await expect(service.cancelTarget(CONTENT_ID, TARGET_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
