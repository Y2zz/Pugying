import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PLATFORM_ACCOUNT_REPOSITORY,
  type IPlatformAccountRepository,
} from '@pugying/platform-account';
import { decryptCredentialPayload } from '@pugying/platform-account/infrastructure/credential-crypto';
import type { ReportPublishResultDto } from '@pugying/content/application/dtos/report-publish-result.dto';
import { MediaService } from '@pugying/content/application/services/media.service';
import type { ContentWithTargets } from '@pugying/content/application/services/content.service';
import {
  CONTENT_REPOSITORY,
  type IContentRepository,
} from '@pugying/content/domain/repositories/content.repository';
import {
  CONTENT_TARGET_REPOSITORY,
  type IContentTargetRepository,
} from '@pugying/content/domain/repositories/content-target.repository';
import { Content } from '@pugying/content/domain/entities/content.entity';
import { ContentTarget } from '@pugying/content/domain/entities/content-target.entity';

/** P0：仅抖音短视频真正下发 */
const P0_PUBLISH_PLATFORMS = new Set(['douyin']);

export interface PublishCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expirationDate?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}

/** 浏览器编排 Agent 所需的单 Target 下发载荷（含签名 URL + Cookie） */
export interface PublishDispatch {
  targetId: string;
  platform: string;
  accountId: string;
  mediaUrl: string;
  coverUrl: string;
  coverLandscapeUrl: string;
  title: string;
  body?: string;
  visibility: string;
  scheduledAt?: string;
  allowDownload: boolean;
  cookies: PublishCookie[];
  mediaExpiresAt: number;
  coverExpiresAt: number;
}

export interface PublishStartResult {
  content: ContentWithTargets;
  /** 按创建顺序串行执行；已成功的 Target 不会出现在此列表 */
  dispatches: PublishDispatch[];
}

@Injectable()
export class ContentPublishService {
  constructor(
    @Inject(CONTENT_REPOSITORY)
    private readonly contents: IContentRepository,
    @Inject(CONTENT_TARGET_REPOSITORY)
    private readonly targets: IContentTargetRepository,
    @Inject(PLATFORM_ACCOUNT_REPOSITORY)
    private readonly accounts: IPlatformAccountRepository,
    private readonly media: MediaService,
  ) {}

  /**
   * 幂等发布：已有 queued/running 拒绝；其余未成功 Target 入队并下发编排载荷。
   * 后端不直连 Agent；由浏览器按 dispatches 串行调本机 Agent。
   */
  async publish(contentId: string): Promise<PublishStartResult> {
    const content = await this.requireContent(contentId);
    this.assertVideoReady(content);

    const existing = await this.targets.findByContent(content.id);
    if (existing.length === 0) {
      throw new BadRequestException('请先选择至少一个分发账号');
    }

    if (
      existing.some(
        (t) => t.publishStatus === 'queued' || t.publishStatus === 'running',
      )
    ) {
      throw new ConflictException('发布进行中，请勿重复提交');
    }

    const eligible = existing.filter((t) => {
      return (
        P0_PUBLISH_PLATFORMS.has(t.platform) &&
        (t.publishStatus === 'idle' ||
          t.publishStatus === 'failed' ||
          t.publishStatus === 'cancelled')
      );
    });

    if (eligible.length === 0) {
      const hasSucceeded = existing.some((t) => t.publishStatus === 'succeeded');
      if (hasSucceeded) {
        throw new BadRequestException('所有目标已发布成功；失败账号请使用重试');
      }
      throw new BadRequestException(
        'P0 仅支持抖音短视频发布；请绑定可用的抖音账号后再试',
      );
    }

    for (const target of eligible) {
      target.publishStatus = 'queued';
      target.errorCode = null;
      target.errorMessage = null;
      target.platformPostId = null;
      target.platformUrl = null;
      target.startedAt = null;
      target.finishedAt = null;
    }
    await this.targets.saveMany(eligible);

    if (content.status !== 'published') {
      content.status = 'published';
      content.publishedAt = new Date();
      await this.contents.save(content);
    }

    const dispatches: PublishDispatch[] = [];
    for (const target of eligible) {
      dispatches.push(await this.buildDispatch(content, target));
    }

    return {
      content: await this.attachTargets(content),
      dispatches,
    };
  }

  /** queued → running，并刷新短时签名 URL / Cookie（防止 TTL 过期） */
  async startTarget(
    contentId: string,
    targetId: string,
  ): Promise<{ target: ContentTarget; dispatch: PublishDispatch }> {
    const content = await this.requireContent(contentId);
    const target = await this.requireTarget(contentId, targetId);
    if (target.publishStatus !== 'queued') {
      throw new BadRequestException(
        `目标状态为 ${target.publishStatus}，无法开始（需为 queued）`,
      );
    }
    target.publishStatus = 'running';
    target.startedAt = new Date();
    target.finishedAt = null;
    target.errorCode = null;
    target.errorMessage = null;
    const saved = await this.targets.save(target);
    const dispatch = await this.buildDispatch(content, saved);
    return { target: saved, dispatch };
  }

  /** running → succeeded | failed（浏览器回写 Agent 结果） */
  async completeTarget(
    contentId: string,
    targetId: string,
    dto: ReportPublishResultDto,
  ): Promise<ContentTarget> {
    const target = await this.requireTarget(contentId, targetId);
    if (target.publishStatus !== 'running' && target.publishStatus !== 'queued') {
      throw new BadRequestException(
        `目标状态为 ${target.publishStatus}，无法写入结果`,
      );
    }
    const now = new Date();
    if (!target.startedAt) {
      target.startedAt = now;
    }
    target.finishedAt = now;
    if (dto.ok) {
      target.publishStatus = 'succeeded';
      target.platformPostId = dto.platformPostId?.trim() || null;
      target.platformUrl = dto.platformUrl?.trim() || null;
      target.errorCode = null;
      target.errorMessage = null;
    } else {
      target.publishStatus = 'failed';
      target.errorCode = dto.errorCode?.trim() || 'PUBLISH_FAILED';
      target.errorMessage =
        dto.errorMessage?.trim() || '发布失败';
      target.platformPostId = null;
      target.platformUrl = null;
      if (target.errorCode === 'AUTH_EXPIRED') {
        await this.markAccountExpired(target.platformAccountId);
      }
    }
    return this.targets.save(target);
  }

  private async markAccountExpired(accountId: string): Promise<void> {
    const account = await this.accounts.findById(accountId);
    if (!account || account.status === 'revoked') {
      return;
    }
    if (account.status === 'expired') {
      return;
    }
    account.status = 'expired';
    await this.accounts.save(account);
  }

  /** queued | running → cancelled */
  async cancelTarget(
    contentId: string,
    targetId: string,
  ): Promise<ContentTarget> {
    const target = await this.requireTarget(contentId, targetId);
    if (
      target.publishStatus !== 'queued' &&
      target.publishStatus !== 'running'
    ) {
      throw new BadRequestException(
        `目标状态为 ${target.publishStatus}，无法取消`,
      );
    }
    target.publishStatus = 'cancelled';
    target.finishedAt = new Date();
    target.errorCode = 'cancelled';
    target.errorMessage = '已取消';
    return this.targets.save(target);
  }

  /** failed | cancelled → queued，并返回单条下发载荷 */
  async retryTarget(
    contentId: string,
    targetId: string,
  ): Promise<{ target: ContentTarget; dispatch: PublishDispatch }> {
    const content = await this.requireContent(contentId);
    this.assertVideoReady(content);
    const target = await this.requireTarget(contentId, targetId);

    const siblings = await this.targets.findByContent(contentId);
    if (
      siblings.some(
        (t) =>
          t.id !== target.id &&
          (t.publishStatus === 'queued' || t.publishStatus === 'running'),
      )
    ) {
      throw new ConflictException('另有目标正在发布，请稍后再重试');
    }

    if (
      target.publishStatus !== 'failed' &&
      target.publishStatus !== 'cancelled'
    ) {
      throw new BadRequestException(
        `目标状态为 ${target.publishStatus}，仅失败或已取消可重试`,
      );
    }
    if (!P0_PUBLISH_PLATFORMS.has(target.platform)) {
      throw new BadRequestException('P0 仅支持抖音短视频重试');
    }

    target.publishStatus = 'queued';
    target.errorCode = null;
    target.errorMessage = null;
    target.platformPostId = null;
    target.platformUrl = null;
    target.startedAt = null;
    target.finishedAt = null;
    const saved = await this.targets.save(target);
    const dispatch = await this.buildDispatch(content, saved);
    return { target: saved, dispatch };
  }

  private async buildDispatch(
    content: Content,
    target: ContentTarget,
  ): Promise<PublishDispatch> {
    const account = await this.accounts.findById(target.platformAccountId);
    if (!account) {
      throw new BadRequestException(
        `平台账号 #${target.platformAccountId} 不存在`,
      );
    }
    if (account.status !== 'active') {
      throw new BadRequestException(
        `平台账号「${account.displayName}」不可用（${account.status}），请重新授权`,
      );
    }

    const cookies = this.decryptCookies(account.credentialCipher);
    const overrides = target.overrides ?? {};

    const mediaRef = content.mediaUrls[0];
    const coverRef = overrides.coverUrl?.trim() || content.coverUrl;
    if (!mediaRef || !coverRef) {
      throw new BadRequestException('缺少视频或竖版封面');
    }

    const mediaSigned = await this.signAssetRef(mediaRef);
    const coverSigned = await this.signAssetRef(coverRef);
    const landscapeRef = content.coverLandscapeUrl?.trim();
    if (!landscapeRef) {
      throw new BadRequestException(
        '缺少横版封面（16:9）；抖音发布需同时提供竖版与横版封面',
      );
    }
    const landscapeSigned = await this.signAssetRef(landscapeRef);

    const scheduled =
      overrides.scheduledAt ||
      (content.scheduledAt ? content.scheduledAt.toISOString() : undefined);

    return {
      targetId: target.id,
      platform: target.platform,
      accountId: account.id,
      mediaUrl: mediaSigned.url,
      coverUrl: coverSigned.url,
      coverLandscapeUrl: landscapeSigned.url,
      title: (overrides.title?.trim() || content.title).trim(),
      body: (overrides.body?.trim() || content.body || undefined) || undefined,
      visibility: content.visibility,
      scheduledAt: scheduled,
      allowDownload: content.allowDownload,
      cookies,
      mediaExpiresAt: mediaSigned.expiresAt,
      coverExpiresAt: coverSigned.expiresAt,
    };
  }

  private async signAssetRef(
    ref: string,
  ): Promise<{ url: string; expiresAt: number }> {
    const assetId = parseMediaAssetId(ref);
    if (!assetId) {
      throw new BadRequestException(
        `媒体地址须为团队库资产（/media/assets/{id}），收到：${ref}`,
      );
    }
    return this.media.createSignedDownloadUrlForTeam(assetId);
  }

  private decryptCookies(cipher: string): PublishCookie[] {
    let payload: { cookies?: PublishCookie[] };
    try {
      payload = JSON.parse(decryptCredentialPayload(cipher)) as {
        cookies?: PublishCookie[];
      };
    } catch {
      throw new BadRequestException('账号凭证不可读，请重新授权');
    }
    if (!payload.cookies?.length) {
      throw new BadRequestException('账号无 Cookie，请重新授权');
    }
    return payload.cookies;
  }

  private assertVideoReady(content: Content): void {
    if (content.type !== 'video') {
      throw new BadRequestException('P0 仅支持短视频发布');
    }
    if (!content.title?.trim()) {
      throw new BadRequestException('标题不能为空');
    }
    if (!content.mediaUrls?.length) {
      throw new BadRequestException('请先上传视频到团队库');
    }
    if (!content.coverUrl?.trim()) {
      throw new BadRequestException('请先准备竖版封面（3:4）');
    }
    if (!content.coverLandscapeUrl?.trim()) {
      throw new BadRequestException(
        '请先准备横版封面（16:9）；抖音发布需同时提供竖版与横版封面',
      );
    }
  }

  private async requireContent(id: string): Promise<Content> {
    const content = await this.contents.findById(id);
    if (!content) {
      throw new NotFoundException(`Content #${id} not found`);
    }
    return content;
  }

  private async requireTarget(
    contentId: string,
    targetId: string,
  ): Promise<ContentTarget> {
    const target = await this.targets.findById(targetId);
    if (!target || target.contentId !== contentId) {
      throw new NotFoundException(`Target #${targetId} not found`);
    }
    return target;
  }

  private async attachTargets(content: Content): Promise<ContentWithTargets> {
    const targets = await this.targets.findByContent(content.id);
    return Object.assign(content, { targets });
  }
}

/** 从 `/media/assets/{uuid}` 或裸 UUID 解析资产 ID */
export function parseMediaAssetId(ref: string): string | null {
  const trimmed = ref.trim();
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuid.test(trimmed)) {
    return trimmed;
  }
  const match = trimmed.match(
    /\/media\/assets\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:\/|$|\?)/i,
  );
  return match?.[1] ?? null;
}
