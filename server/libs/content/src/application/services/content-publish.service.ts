import { videoPublishIssue } from '../../domain/video-publish-rules';
import { graphicPublishIssue } from '../../domain/graphic-publish-rules';
import { formatArticleBodyForPlatform } from '../../domain/article-body-format';
import { articlePublishIssue } from '../../domain/article-publish-rules';
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { access } from 'fs/promises';
import { constants } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeFile, mkdir } from 'fs/promises';
import { PLATFORM_ACCOUNT_REPOSITORY, type IPlatformAccountRepository } from '@pugying/platform-account';
import { decryptCredentialPayload } from '@pugying/platform-account/infrastructure/credential-crypto';
import type { ReportPublishResultDto } from '@pugying/content/application/dtos/report-publish-result.dto';
import type { ContentView } from '@pugying/content/application/services/content.service';
import { CONTENT_REPOSITORY, type IContentRepository } from '@pugying/content/domain/repositories/content.repository';
import { CONTENT_TARGET_REPOSITORY, type IContentTargetRepository } from '@pugying/content/domain/repositories/content-target.repository';
import { Content } from '@pugying/content/domain/entities/content.entity';
import { ContentTarget } from '@pugying/content/domain/entities/content-target.entity';
import { PublishErrorCodes } from '@pugying/content/domain/publish-error-codes';

const GRAPHIC_PUBLISH_PLATFORMS = new Set([
  'douyin',
  'toutiao',
  'xiaohongshu',
  'channels',
]);

const ARTICLE_PUBLISH_PLATFORMS = new Set(['douyin', 'toutiao', 'bilibili']);

function supportsPublish(contentType: Content['type'], platform: string): boolean {
  return contentType === 'article'
    ? ARTICLE_PUBLISH_PLATFORMS.has(platform)
    : contentType === 'graphic'
      ? GRAPHIC_PUBLISH_PLATFORMS.has(platform)
      : ['douyin', 'xiaohongshu', 'toutiao', 'bilibili', 'channels'].includes(
          platform,
        );
}

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

/** 桌面 Agent 所需的单 Target 下发载荷（本机路径，无签名 URL） */
export interface PublishDispatch {
  targetId: string;
  platform: string;
  accountId: string;
  /** 与内容 type 对齐 */
  contentType: 'video' | 'article' | 'graphic';
  /** 本机视频绝对路径（video）；图文/文章时为首图路径兼容字段，可为空 */
  mediaPath: string;
  /** 图文为轮播图；文章为插图列表；视频通常为单元素 */
  mediaPaths: string[];
  /** 主封面临时文件路径；抖音文章为竖版，头条/B站文章为横版 */
  coverPath: string;
  /** 横封面临时文件路径；图文可为空字符串 */
  coverLandscapePath: string;
  articleCoverPaths?: string[];
  title: string;
  body?: string;
  tags?: string[];
  articleSettings?: import('../../domain/article-settings').ArticleAccountSettings;
  bilibiliVideoSettings?: import('../../domain/bilibili-video-settings').BilibiliVideoSettings;
  authorDeclaration?: import('../../domain/author-declaration').AuthorDeclaration;
  visibility: string;
  scheduledAt?: string;
  allowDownload: boolean;
  cookies: PublishCookie[];
}

export interface PublishStartResult {
  content: ContentView;
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
  ) {}

  /**
   * 幂等发布：已有 queued/running 拒绝；其余未成功 Target 入队并下发编排载荷。
   * 后端不直连平台；由桌面按 dispatches 加入本机分发队列。
   */
  async publish(contentId: string): Promise<PublishStartResult> {
    const content = await this.requireContentWithCovers(contentId);
    this.assertContentReady(content);

    const existing = await this.targets.findByContent(content.id);
    if (existing.length === 0) {
      throw new BadRequestException('请先选择至少一个分发账号');
    }

    if (existing.some((t) => t.publishStatus === 'queued' || t.publishStatus === 'running')) {
      throw new ConflictException('发布进行中，请勿重复提交');
    }

    const eligible = existing.filter((t) => {
      return supportsPublish(content.type, t.platform) && (t.publishStatus === 'idle' || t.publishStatus === 'failed' || t.publishStatus === 'cancelled');
    });

    if (eligible.length === 0) {
      const hasSucceeded = existing.some((t) => t.publishStatus === 'succeeded');
      if (hasSucceeded) {
        throw new BadRequestException('所有目标已发布成功；失败账号请使用重试');
      }
      throw new BadRequestException(
        content.type === 'graphic'
          ? '请绑定可用的抖音、头条、小红书或视频号账号后再发布图文'
          : content.type === 'article'
            ? '请绑定可用的文章发布账号后再试'
            : '暂时仅支持抖音短视频发布；请绑定可用的抖音账号后再试',
      );
    }

    const dispatches: PublishDispatch[] = [];
    for (const target of eligible) {
      dispatches.push(await this.buildDispatch(content, target));
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

    return {
      content: await this.toContentView(content),
      dispatches,
    };
  }

  /** queued → running，并刷新本机路径 / Cookie */
  async startTarget(contentId: string, targetId: string): Promise<{ target: ContentTarget; dispatch: PublishDispatch }> {
    const content = await this.requireContentWithCovers(contentId);
    const target = await this.requireTarget(contentId, targetId);
    if (target.publishStatus !== 'queued') {
      throw new BadRequestException(`目标状态为 ${target.publishStatus}，无法开始（需为 queued）`);
    }
    this.assertContentReady(content);
    const dispatch = await this.buildDispatch(content, target);
    target.publishStatus = 'running';
    target.startedAt = new Date();
    target.finishedAt = null;
    target.errorCode = null;
    target.errorMessage = null;
    const saved = await this.targets.save(target);
    return { target: saved, dispatch };
  }

  /** running → succeeded | failed（浏览器回写 Agent 结果） */
  async completeTarget(contentId: string, targetId: string, dto: ReportPublishResultDto): Promise<ContentTarget> {
    const target = await this.requireTarget(contentId, targetId);
    if (target.publishStatus !== 'running' && target.publishStatus !== 'queued') {
      throw new BadRequestException(`目标状态为 ${target.publishStatus}，无法写入结果`);
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
      target.errorMessage = dto.errorMessage?.trim() || '发布失败';
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
  async cancelTarget(contentId: string, targetId: string): Promise<ContentTarget> {
    const target = await this.requireTarget(contentId, targetId);
    if (target.publishStatus !== 'queued' && target.publishStatus !== 'running') {
      throw new BadRequestException(`目标状态为 ${target.publishStatus}，无法取消`);
    }
    target.publishStatus = 'cancelled';
    target.finishedAt = new Date();
    target.errorCode = 'cancelled';
    target.errorMessage = '已取消';
    return this.targets.save(target);
  }

  /** failed | cancelled → queued，并返回单条下发载荷 */
  async retryTarget(contentId: string, targetId: string): Promise<{ target: ContentTarget; dispatch: PublishDispatch }> {
    const content = await this.requireContentWithCovers(contentId);
    this.assertContentReady(content);
    const target = await this.requireTarget(contentId, targetId);

    const siblings = await this.targets.findByContent(contentId);
    if (siblings.some((t) => t.id !== target.id && (t.publishStatus === 'queued' || t.publishStatus === 'running'))) {
      throw new ConflictException('另有目标正在发布，请稍后再重试');
    }

    if (target.publishStatus !== 'failed' && target.publishStatus !== 'cancelled') {
      throw new BadRequestException(`目标状态为 ${target.publishStatus}，仅失败或已取消可重试`);
    }
    if (!supportsPublish(content.type, target.platform)) {
      throw new BadRequestException(
        content.type === 'graphic' ? '该平台暂不支持图文重试' : content.type === 'article' ? '该平台暂不支持文章发布' : '暂时仅支持抖音短视频重试',
      );
    }

    const dispatch = await this.buildDispatch(content, target);
    target.publishStatus = 'queued';
    target.errorCode = null;
    target.errorMessage = null;
    target.platformPostId = null;
    target.platformUrl = null;
    target.startedAt = null;
    target.finishedAt = null;
    const saved = await this.targets.save(target);
    return { target: saved, dispatch };
  }

  private async buildDispatch(content: Content, target: ContentTarget): Promise<PublishDispatch> {
    const account = await this.accounts.findById(target.platformAccountId);
    if (!account) {
      throw new BadRequestException(`平台账号 #${target.platformAccountId} 不存在`);
    }
    if (account.status !== 'active') {
      throw new BadRequestException(`平台账号「${account.displayName}」不可用（${account.status}），请重新授权`);
    }

    const cookies = this.decryptCookies(account.credentialCipher);
    const overrides = target.overrides ?? {};
    const isGraphic = content.type === 'graphic';
    const isArticle = content.type === 'article';
    const isDouyinArticle = isArticle && target.platform === 'douyin';
    const scheduled = overrides.scheduledAt || (content.scheduledAt ? content.scheduledAt.toISOString() : undefined);
    if (isArticle) {
      const issue = articlePublishIssue({
        platform: target.platform,
        title: (overrides.title?.trim() || content.title).trim(),
        body: overrides.body?.trim() || content.body || '',
        tags: overrides.tags ?? content.tags,
        visibility: overrides.visibility ?? content.visibility,
        scheduledAt: scheduled,
        settings: overrides.articleSettings,
      });
      if (issue) {
        throw new BadRequestException(issue);
      }
    }

    const mediaPaths = (content.mediaPaths ?? []).map((p) => p.trim()).filter(Boolean);
    if (isGraphic) {
      const issue = graphicPublishIssue({
        platform: target.platform,
        title: overrides.title?.trim() || content.title,
        body: overrides.body?.trim() || content.body || '',
        imageCount: mediaPaths.length,
        tags: overrides.tags ?? content.tags,
        visibility: overrides.visibility ?? content.visibility,
        scheduledAt: scheduled,
        authorDeclaration: overrides.authorDeclaration,
      });
      if (issue) {
        throw new BadRequestException(issue);
      }
    }
    if (!isArticle && !isGraphic) {
      const issue = videoPublishIssue({
        platform: target.platform,
        title: overrides.title?.trim() || content.title,
        body: overrides.body?.trim() || content.body || '',
        videoCount: mediaPaths.length,
        tags: overrides.tags ?? content.tags,
        visibility: overrides.visibility ?? content.visibility,
        scheduledAt: scheduled,
        authorDeclaration: overrides.authorDeclaration,
        bilibiliVideoSettings: overrides.bilibiliVideoSettings,
      });
      if (issue) {
        throw new BadRequestException(issue);
      }
    }
    // 图文必须有轮播图；视频必须有文件；文章插图可空
    if (!isArticle && mediaPaths.length === 0) {
      throw new BadRequestException(isGraphic ? '缺少图片本地路径' : '缺少视频本地路径');
    }
    for (const path of mediaPaths) {
      await this.assertReadableFile(path);
    }
    const mediaPath = mediaPaths[0] ?? '';

    const targetWithCovers = (await this.targets.findByIdWithCovers(target.id)) ?? target;

    const portrait = this.resolveCover(content, targetWithCovers, 'portrait');
    let landscape = this.resolveCover(content, targetWithCovers, 'landscape');
    const settings = overrides.articleSettings;
    const noArticleCover =
      isArticle && ((target.platform === 'toutiao' && settings?.coverMode === 'none') || (target.platform === 'bilibili' && settings?.customCover === false));
    if (noArticleCover) {
      landscape = null;
    }
    const extraCovers: { mime: string; data: Buffer }[] = [];
    if (isArticle && target.platform === 'toutiao' && settings?.coverMode === 'triple') {
      for (const index of [2, 3] as const) {
        const mime = targetWithCovers[index === 2 ? 'coverLandscape2Mime' : 'coverLandscape3Mime'];
        const data = targetWithCovers[index === 2 ? 'coverLandscape2Data' : 'coverLandscape3Data'];
        if (!mime || !data?.length) {
          throw new BadRequestException('请设置完整的三张封面');
        }
        extraCovers.push({ mime, data });
      }
    }

    if (isGraphic) {
      if (target.platform === 'douyin' && !portrait) {
        throw new BadRequestException('缺少竖版封面');
      }
    } else if (isArticle) {
      if (isDouyinArticle && !portrait) {
        throw new BadRequestException('缺少竖版封面（3:4）');
      }
      if (!isDouyinArticle && !noArticleCover && !landscape && (target.platform !== 'bilibili' || settings?.customCover === true)) {
        throw new BadRequestException('缺少横版封面');
      }
    }

    if (!isArticle && !isGraphic && ['toutiao', 'bilibili'].includes(target.platform) && !portrait && !landscape) {
      throw new BadRequestException('请设置视频封面');
    }

    const primaryCover = isGraphic && target.platform !== 'douyin' ? null : isArticle && !isDouyinArticle ? landscape : portrait;
    if (isArticle && ['toutiao', 'bilibili'].includes(target.platform)) {
      for (const cover of [...(primaryCover ? [primaryCover] : []), ...extraCovers]) {
        if (!['image/jpeg', 'image/png'].includes(cover.mime)) {
          throw new BadRequestException('该平台封面仅支持 JPG、PNG');
        }
      }
    }
    const workDir = join(tmpdir(), `pugying-dispatch-${target.id}`);
    await mkdir(workDir, { recursive: true });
    let coverPath = '';
    if (primaryCover) {
      coverPath = join(workDir, `cover${extForMime(primaryCover.mime)}`);
      await writeFile(coverPath, primaryCover.data);
    }

    const articleCoverPaths = isArticle ? (coverPath ? [coverPath] : []) : undefined;
    for (const [index, cover] of extraCovers.entries()) {
      const path = join(workDir, `cover-${index + 2}${extForMime(cover.mime)}`);
      await writeFile(path, cover.data);
      articleCoverPaths!.push(path);
    }

    let coverLandscapePath = '';
    if (isArticle && !isDouyinArticle) {
      // 头条/B站文章的主封面为横版；抖音文章不传横版封面。
      coverLandscapePath = coverPath;
    } else if (!isArticle && landscape) {
      coverLandscapePath = join(workDir, `cover-landscape${extForMime(landscape.mime)}`);
      await writeFile(coverLandscapePath, landscape.data);
    }

    const contentType: PublishDispatch['contentType'] = isGraphic ? 'graphic' : isArticle ? 'article' : 'video';

    return {
      targetId: target.id,
      platform: target.platform,
      accountId: account.id,
      contentType,
      mediaPath,
      mediaPaths,
      coverPath,
      coverLandscapePath,
      articleCoverPaths,
      title: (overrides.title?.trim() || content.title).trim(),
      body: isArticle
        ? formatArticleBodyForPlatform(overrides.body?.trim() || content.body || '', target.platform)
        : overrides.body?.trim() || content.body || undefined,
      tags: overrides.tags ?? content.tags,
      articleSettings: isArticle ? overrides.articleSettings : undefined,
      bilibiliVideoSettings: !isArticle && !isGraphic && target.platform === 'bilibili' ? overrides.bilibiliVideoSettings : undefined,
      authorDeclaration: isGraphic || !isArticle ? (overrides.authorDeclaration ?? 'none') : undefined,
      visibility: overrides.visibility ?? content.visibility,
      scheduledAt: scheduled,
      allowDownload: overrides.allowDownload ?? content.allowDownload,
      cookies,
    };
  }

  private resolveCover(content: Content, target: ContentTarget, kind: 'portrait' | 'landscape'): { mime: string; data: Buffer } | null {
    if (kind === 'portrait') {
      if (target.coverMime && target.coverData?.length) {
        return { mime: target.coverMime, data: target.coverData };
      }
      if (content.coverMime && content.coverData?.length) {
        return { mime: content.coverMime, data: content.coverData };
      }
      return null;
    }
    if (target.coverLandscapeMime && target.coverLandscapeData?.length) {
      return {
        mime: target.coverLandscapeMime,
        data: target.coverLandscapeData,
      };
    }
    if (content.coverLandscapeMime && content.coverLandscapeData?.length) {
      return {
        mime: content.coverLandscapeMime,
        data: content.coverLandscapeData,
      };
    }
    return null;
  }

  private async assertReadableFile(filePath: string): Promise<void> {
    try {
      await access(filePath, constants.R_OK);
    } catch {
      throw new BadRequestException({
        message: `源文件不可用，请重新选择：${filePath}`,
        errorCode: PublishErrorCodes.MEDIA_MISSING,
      });
    }
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

  private assertContentReady(content: Content): void {
    if (content.type === 'graphic') {
      this.assertGraphicReady(content);
      return;
    }
    if (content.type === 'article') {
      this.assertArticleReady(content);
      return;
    }
    this.assertVideoReady(content);
  }

  /** 图文：标题 + 至少一张轮播图；封面按账号在 buildDispatch 校验。 */
  private assertGraphicReady(content: Content): void {
    if (content.type !== 'graphic') {
      throw new BadRequestException('内容类型不是图文');
    }
    if (!content.title?.trim()) {
      throw new BadRequestException('标题不能为空');
    }
    if (!content.mediaPaths?.length) {
      throw new BadRequestException('请先选择本机图片文件');
    }
  }

  /** 文章：标题 + 正文；封面按账号平台在 buildDispatch 校验。 */
  private assertArticleReady(content: Content): void {
    if (content.type !== 'article') {
      throw new BadRequestException('内容类型不是文章');
    }
    if (!content.title?.trim()) {
      throw new BadRequestException('标题不能为空');
    }
    if (!content.body?.trim()) {
      throw new BadRequestException('正文不能为空');
    }
  }

  private assertVideoReady(content: Content): void {
    if (content.type !== 'video') {
      throw new BadRequestException('内容类型不是视频');
    }
    if (!content.title?.trim()) {
      throw new BadRequestException('标题不能为空');
    }
    if (!content.mediaPaths?.length) {
      throw new BadRequestException('请先选择本机视频文件');
    }
  }

  private async requireContentWithCovers(id: string): Promise<Content> {
    const content = await this.contents.findByIdWithCovers(id);
    if (!content) {
      throw new NotFoundException(`Content #${id} not found`);
    }
    return content;
  }

  private async requireTarget(contentId: string, targetId: string): Promise<ContentTarget> {
    const target = await this.targets.findById(targetId);
    if (!target || target.contentId !== contentId) {
      throw new NotFoundException(`Target #${targetId} not found`);
    }
    return target;
  }

  private async toContentView(content: Content): Promise<ContentView> {
    const targets = await this.targets.findByContent(content.id);
    const { coverData: _cd, coverLandscapeData: _cld, coverMime, coverLandscapeMime, ...rest } = content;
    return {
      ...rest,
      hasCover: Boolean(coverMime),
      hasCoverLandscape: Boolean(coverLandscapeMime),
      targets: targets.map((t) => {
        const {
          coverData: _tcd,
          coverLandscapeData: _tcld,
          coverLandscape2Data: _tc2,
          coverLandscape3Data: _tc3,
          coverLandscape2Mime: tm2,
          coverLandscape3Mime: tm3,
          coverMime: tm,
          coverLandscapeMime: tlm,
          ...tRest
        } = t;
        return {
          ...tRest,
          hasCover: Boolean(tm),
          hasCoverLandscape: Boolean(tlm),
          hasCoverLandscape2: Boolean(tm2),
          hasCoverLandscape3: Boolean(tm3),
        };
      }),
    };
  }
}

function extForMime(mime: string): string {
  if (mime === 'image/png') {
    return '.png';
  }
  if (mime === 'image/webp') {
    return '.webp';
  }
  return '.jpg';
}
