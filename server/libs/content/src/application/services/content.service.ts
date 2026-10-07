import { articleSettingsForPlatform } from '../../domain/article-settings';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { isAbsolute } from 'path';
import { isAuthorDeclaration } from '../../domain/author-declaration';
import { PLATFORM_ACCOUNT_REPOSITORY, type IPlatformAccountRepository } from '@pugying/platform-account';
import {
  isContentStatus,
  isContentType,
  isContentVisibility,
  isPlatformAllowedForContentType,
  type ContentStatus,
  type ContentTargetOverrides,
  type ContentType,
  type ContentVisibility,
} from '@pugying/content/domain/content-types';
import { Content } from '@pugying/content/domain/entities/content.entity';
import { ContentTarget } from '@pugying/content/domain/entities/content-target.entity';
import { CONTENT_REPOSITORY, type ContentCoverKind, type IContentRepository } from '@pugying/content/domain/repositories/content.repository';
import {
  CONTENT_TARGET_REPOSITORY,
  TARGET_COVER_COLUMNS,
  type ContentTargetCoverKind,
  type IContentTargetRepository,
} from '@pugying/content/domain/repositories/content-target.repository';
import { ContentTargetDto, CreateContentDto, TargetOverridesDto, UpdateContentDto } from '@pugying/content/application/dtos';

import { CONTENT_MANAGEMENT_STATUSES, type ContentManagementStatus, type ContentStatusCounts } from '../../domain/repositories/content.repository';
import { DISTRIBUTION_VIEWS, type DistributionView } from '../../domain/distribution';

const COVER_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** 封面上限 20MB（裁切后通常远小） */
const MAX_COVER_BYTES = 20 * 1024 * 1024;

/** API 对外视图：不返回 BLOB，仅 hasCover 标志 */
export type ContentTargetView = Omit<
  ContentTarget,
  | 'coverData'
  | 'coverLandscapeData'
  | 'coverMime'
  | 'coverLandscapeMime'
  | 'coverLandscape2Data'
  | 'coverLandscape2Mime'
  | 'coverLandscape3Data'
  | 'coverLandscape3Mime'
> & {
  hasCover: boolean;
  hasCoverLandscape: boolean;
  hasCoverLandscape2: boolean;
  hasCoverLandscape3: boolean;
};

export type ContentView = Omit<Content, 'coverData' | 'coverLandscapeData' | 'coverMime' | 'coverLandscapeMime'> & {
  hasCover: boolean;
  hasCoverLandscape: boolean;
  targets: ContentTargetView[];
};

export type ContentWithTargets = Content & { targets: ContentTarget[] };

export type ContentListPage = {
  items: ContentView[];
  total: number;
  page: number;
  pageSize: number;
  counts: ContentStatusCounts;
};

export type CoverBinary = {
  mime: string;
  data: Buffer;
};

@Injectable()
export class ContentService {
  constructor(
    @Inject(CONTENT_REPOSITORY)
    private readonly repository: IContentRepository,
    @Inject(CONTENT_TARGET_REPOSITORY)
    private readonly targetRepository: IContentTargetRepository,
    @Inject(PLATFORM_ACCOUNT_REPOSITORY)
    private readonly platformAccountRepository: IPlatformAccountRepository,
  ) {}

  async findDistributions(view = 'active', page = 1, pageSize = 20) {
    if (!DISTRIBUTION_VIEWS.includes(view as DistributionView) || !Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new BadRequestException('分发筛选条件无效');
    }
    const result = await this.targetRepository.findDistributionPage({ view: view as DistributionView, page, pageSize, since: new Date(Date.now() - 24 * 60 * 60 * 1000) });
    const accounts = new Map((await this.platformAccountRepository.findAll()).map((account) => [account.id, account]));
    return { ...result, page, pageSize, items: result.items.map((item) => ({ ...item, accountName: accounts.get(item.accountId)?.displayName ?? '账号已移除', accountAvailable: accounts.has(item.accountId) })) };
  }

  async findAll(type?: string, q?: string, page = 1, pageSize = 20, managementStatus?: string): Promise<ContentListPage> {
    if (type !== undefined && type !== '' && !isContentType(type)) {
      throw new BadRequestException(`Unsupported content type: ${type}`);
    }
    if (!Number.isInteger(page) || page < 1) {
      throw new BadRequestException('page must be a positive integer');
    }
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new BadRequestException('pageSize must be between 1 and 100');
    }
    if (managementStatus && !CONTENT_MANAGEMENT_STATUSES.includes(managementStatus as ContentManagementStatus)) {
      throw new BadRequestException('作品状态无效');
    }
    const { rows, total, counts } = await this.repository.findPaged({
      managementStatus: managementStatus ? (managementStatus as ContentManagementStatus) : undefined,
      type: type && isContentType(type) ? type : undefined,
      q,
      page,
      pageSize,
    });
    if (rows.length === 0) {
      return { items: [], total, page, pageSize, counts };
    }
    const targets = await this.targetRepository.findByContents(rows.map((row) => row.id));
    const grouped = new Map<string, ContentTarget[]>();
    for (const target of targets) {
      const list = grouped.get(target.contentId) ?? [];
      list.push(target);
      grouped.set(target.contentId, list);
    }
    const items = rows.map((row) => this.toContentView(row, grouped.get(row.id) ?? []));
    return { items, total, page, pageSize, counts };
  }

  async findById(id: string): Promise<ContentView> {
    const content = await this.repository.findById(id);
    if (!content) {
      throw new NotFoundException(`Content #${id} not found`);
    }
    const targets = await this.targetRepository.findByContent(content.id);
    return this.toContentView(content, targets);
  }

  async create(dto: CreateContentDto): Promise<ContentView> {
    if (!isContentType(dto.type)) {
      throw new BadRequestException(`Unsupported content type: ${dto.type}`);
    }
    const status: ContentStatus = dto.status !== undefined && isContentStatus(dto.status) ? dto.status : 'draft';
    const visibility: ContentVisibility = dto.visibility !== undefined && isContentVisibility(dto.visibility) ? dto.visibility : 'public';

    const preparedTargets = await this.prepareTargets(dto.type, dto.targets);
    const mediaPaths = this.normalizeMediaPaths(dto.mediaPaths);

    const content = this.repository.create({
      type: dto.type,
      title: dto.title.trim(),
      body: dto.body?.trim() || null,
      coverMime: null,
      coverData: null,
      coverLandscapeMime: null,
      coverLandscapeData: null,
      mediaPaths,
      status,
      publishedAt: status === 'published' ? new Date() : null,
      tags: this.normalizeList(dto.tags),
      location: dto.location?.trim() || null,
      visibility,
      scheduledAt: this.parseScheduledAt(dto.scheduledAt),
      allowDownload: dto.allowDownload ?? true,
    });
    const saved = await this.repository.save(content);
    const targets = await this.replaceTargets(saved, preparedTargets);
    return this.toContentView(saved, targets);
  }

  async update(id: string, dto: UpdateContentDto): Promise<ContentView> {
    const content = await this.repository.findById(id);
    if (!content) {
      throw new NotFoundException(`Content #${id} not found`);
    }

    if (dto.title !== undefined) {
      content.title = dto.title.trim();
    }
    if (dto.body !== undefined) {
      content.body = dto.body.trim() || null;
    }
    if (dto.mediaPaths !== undefined) {
      content.mediaPaths = this.normalizeMediaPaths(dto.mediaPaths);
    }
    if (dto.tags !== undefined) {
      content.tags = this.normalizeList(dto.tags);
    }
    if (dto.location !== undefined) {
      content.location = dto.location.trim() || null;
    }
    if (dto.visibility !== undefined && isContentVisibility(dto.visibility)) {
      content.visibility = dto.visibility;
    }
    if (dto.scheduledAt !== undefined) {
      content.scheduledAt = this.parseScheduledAt(dto.scheduledAt);
    }
    if (dto.allowDownload !== undefined) {
      content.allowDownload = dto.allowDownload;
    }
    if (dto.status !== undefined && isContentStatus(dto.status)) {
      this.applyStatus(content, dto.status);
    }

    let preparedTargets: Partial<ContentTarget>[] | undefined;
    if (dto.targets !== undefined) {
      preparedTargets = await this.prepareTargets(content.type, dto.targets);
    }

    const saved = await this.repository.save(content);
    const targets = preparedTargets !== undefined ? await this.replaceTargets(saved, preparedTargets) : await this.targetRepository.findByContent(saved.id);
    return this.toContentView(saved, targets);
  }

  async remove(id: string): Promise<void> {
    const content = await this.repository.findById(id);
    if (!content) {
      throw new NotFoundException(`Content #${id} not found`);
    }
    await this.targetRepository.deleteByContent(content.id);
    await this.repository.remove(content);
  }

  async putCover(contentId: string, kind: ContentCoverKind, file: { buffer?: Buffer; mimetype?: string; size?: number } | undefined): Promise<ContentView> {
    await this.requireContent(contentId);
    const { mime, data } = this.assertCoverFile(file);
    await this.repository.setCover(contentId, kind, mime, data);
    return this.findById(contentId);
  }

  async deleteCover(contentId: string, kind: ContentCoverKind): Promise<ContentView> {
    await this.requireContent(contentId);
    await this.repository.clearCover(contentId, kind);
    return this.findById(contentId);
  }

  async putTargetCover(
    contentId: string,
    targetId: string,
    kind: ContentTargetCoverKind,
    file: { buffer?: Buffer; mimetype?: string; size?: number } | undefined,
  ): Promise<ContentView> {
    const target = await this.requireTarget(contentId, targetId);
    if (kind === 'landscape2' || kind === 'landscape3') {
      const content = await this.requireContent(contentId);
      if (content.type !== 'article' || target.platform !== 'toutiao') {
        throw new BadRequestException('该账号不支持三图封面');
      }
    }
    const { mime, data } = this.assertCoverFile(file);
    await this.targetRepository.setCover(targetId, kind, mime, data);
    return this.findById(contentId);
  }

  async deleteTargetCover(contentId: string, targetId: string, kind: ContentTargetCoverKind): Promise<ContentView> {
    await this.requireTarget(contentId, targetId);
    await this.targetRepository.clearCover(targetId, kind);
    return this.findById(contentId);
  }

  async getCoverBinary(contentId: string, kind: ContentCoverKind): Promise<CoverBinary> {
    const content = await this.repository.findByIdWithCovers(contentId);
    if (!content) {
      throw new NotFoundException(`Content #${contentId} not found`);
    }
    return this.pickCover(content, kind);
  }

  /**
   * 仅返回 Target 自身差异封面；无差异时 404，由前端回落内容级 URL。
   */
  async getTargetCoverBinary(contentId: string, targetId: string, kind: ContentTargetCoverKind): Promise<CoverBinary> {
    const target = await this.targetRepository.findByIdWithCovers(targetId);
    if (!target || target.contentId !== contentId) {
      throw new NotFoundException(`Target #${targetId} not found`);
    }
    return this.pickCover(target, kind);
  }

  private pickCover(
    owner: Pick<Content, 'coverMime' | 'coverData' | 'coverLandscapeMime' | 'coverLandscapeData'> &
      Partial<Pick<ContentTarget, 'coverLandscape2Mime' | 'coverLandscape2Data' | 'coverLandscape3Mime' | 'coverLandscape3Data'>>,
    kind: ContentTargetCoverKind,
  ): CoverBinary {
    const [mimeColumn, dataColumn] = TARGET_COVER_COLUMNS[kind];
    const mime = owner[mimeColumn];
    const data = owner[dataColumn];
    if (!mime || !data?.length) {
      throw new NotFoundException('封面不存在');
    }
    return { mime, data };
  }

  private assertCoverFile(
    file:
      | {
          buffer?: Buffer;
          mimetype?: string;
          size?: number;
        }
      | undefined,
  ): CoverBinary {
    if (!file?.buffer?.length) {
      throw new BadRequestException('请上传封面文件（字段名 file）');
    }
    const mime = (file.mimetype ?? '').toLowerCase();
    if (!COVER_MIME_TYPES.has(mime)) {
      throw new BadRequestException('封面仅支持 JPEG / PNG / WebP');
    }
    if (file.buffer.length > MAX_COVER_BYTES) {
      throw new BadRequestException('封面文件过大（上限 20MB）');
    }
    return { mime, data: file.buffer };
  }

  private async requireContent(id: string): Promise<Content> {
    const content = await this.repository.findById(id);
    if (!content) {
      throw new NotFoundException(`Content #${id} not found`);
    }
    return content;
  }

  private async requireTarget(contentId: string, targetId: string): Promise<ContentTarget> {
    const target = await this.targetRepository.findById(targetId);
    if (!target || target.contentId !== contentId) {
      throw new NotFoundException(`Target #${targetId} not found`);
    }
    return target;
  }

  /** 校验账号归属、内容形态与平台匹配，并组装分发目标（不落库） */
  private async prepareTargets(contentType: ContentType, targets: ContentTargetDto[] | undefined): Promise<Partial<ContentTarget>[]> {
    if (!targets?.length) {
      return [];
    }
    const seen = new Set<string>();
    const prepared: Partial<ContentTarget>[] = [];
    for (const target of targets) {
      if (seen.has(target.platformAccountId)) {
        continue;
      }
      seen.add(target.platformAccountId);
      const account = await this.platformAccountRepository.findById(target.platformAccountId);
      if (!account) {
        throw new BadRequestException(`Platform account #${target.platformAccountId} not found`);
      }
      if (!isPlatformAllowedForContentType(contentType, account.platform)) {
        throw new BadRequestException(
          contentType === 'article'
            ? `「${account.displayName}」不支持文章分发`
            : contentType === 'graphic'
              ? `「${account.displayName}」不支持图文分发`
              : `「${account.displayName}」不支持该内容类型`,
        );
      }
      prepared.push({
        platformAccountId: account.id,
        platform: account.platform,
        overrides: this.sanitizeOverrides(target.overrides, contentType, account.platform),
        coverMime: null,
        coverData: null,
        coverLandscapeMime: null,
        coverLandscapeData: null,
        coverLandscape2Mime: null,
        coverLandscape2Data: null,
        coverLandscape3Mime: null,
        coverLandscape3Data: null,
        publishStatus: 'idle',
        platformPostId: null,
        platformUrl: null,
        errorCode: null,
        errorMessage: null,
        startedAt: null,
        finishedAt: null,
      });
    }
    return prepared;
  }

  private async replaceTargets(content: Content, prepared: Partial<ContentTarget>[]): Promise<ContentTarget[]> {
    const existing = await this.targetRepository.findByContent(content.id);
    const busy = existing.some((target) => target.publishStatus === 'queued' || target.publishStatus === 'running');
    if (busy) {
      throw new BadRequestException('发布进行中，无法修改分发账号；请等待完成或取消后再试');
    }
    // 整体替换会重建 Target 行，账号差异封面需前端按需重新上传
    await this.targetRepository.deleteByContent(content.id);
    if (prepared.length === 0) {
      return [];
    }
    const entities = prepared.map((data) => this.targetRepository.create({ ...data, contentId: content.id }));
    return this.targetRepository.saveMany(entities);
  }

  private sanitizeOverrides(overrides: TargetOverridesDto | undefined, contentType: string, platform: string): ContentTargetOverrides {
    if (!overrides) {
      return {};
    }
    const result: ContentTargetOverrides = {};
    if (contentType === 'article' && overrides.articleSettings) {
      result.articleSettings = articleSettingsForPlatform(overrides.articleSettings, platform);
    }
    if (overrides.title?.trim()) {
      result.title = overrides.title.trim();
    }
    if (overrides.body?.trim()) {
      result.body = overrides.body.trim();
    }
    const tags = this.normalizeList(overrides.tags);
    if (tags.length > 0) {
      result.tags = tags;
    }
    if (overrides.scheduledAt) {
      const date = new Date(overrides.scheduledAt);
      if (!Number.isNaN(date.getTime())) {
        result.scheduledAt = date.toISOString();
      }
    }
    if (overrides.visibility !== undefined && isContentVisibility(overrides.visibility)) {
      result.visibility = overrides.visibility;
    }
    if (overrides.allowDownload !== undefined) {
      result.allowDownload = overrides.allowDownload;
    }
    if (overrides.authorDeclaration !== undefined && isAuthorDeclaration(overrides.authorDeclaration)) {
      result.authorDeclaration = overrides.authorDeclaration;
    }
    if (overrides.location?.trim()) {
      result.location = overrides.location.trim();
    }
    if (overrides.partition?.trim()) {
      result.partition = overrides.partition.trim();
    }
    return result;
  }

  private parseScheduledAt(value: string | undefined): Date | null {
    if (!value?.trim()) {
      return null;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Invalid scheduledAt: ${value}`);
    }
    return date;
  }

  private applyStatus(content: Content, status: ContentStatus): void {
    // 已发布作品不可退回草稿，状态单向 draft → published
    if (content.status === 'published' && status === 'draft') {
      throw new BadRequestException('Published content cannot be reverted to draft');
    }
    if (status === 'published' && content.status !== 'published') {
      content.publishedAt = new Date();
    }
    if (status === 'draft') {
      content.publishedAt = null;
    }
    content.status = status;
  }

  private normalizeList(values: string[] | undefined): string[] {
    return (values ?? []).map((value) => value.trim()).filter((value) => value.length > 0);
  }

  /** 保存时只校验绝对路径形态，不强制 exists（源文件可稍后补齐） */
  private normalizeMediaPaths(values: string[] | undefined): string[] {
    const paths = this.normalizeList(values);
    for (const p of paths) {
      if (!isAbsolute(p)) {
        throw new BadRequestException(`媒体路径须为本机绝对路径：${p}`);
      }
    }
    return paths;
  }

  private toContentView(content: Content, targets: ContentTarget[]): ContentView {
    const { coverData: _cd, coverLandscapeData: _cld, coverMime, coverLandscapeMime, ...rest } = content;
    return {
      ...rest,
      hasCover: Boolean(coverMime),
      hasCoverLandscape: Boolean(coverLandscapeMime),
      targets: targets.map((t) => this.toTargetView(t)),
    };
  }

  private toTargetView(target: ContentTarget): ContentTargetView {
    const {
      coverData: _cd,
      coverLandscapeData: _cld,
      coverMime,
      coverLandscapeMime,
      coverLandscape2Mime,
      coverLandscape2Data: _c2,
      coverLandscape3Mime,
      coverLandscape3Data: _c3,
      ...rest
    } = target;
    return {
      ...rest,
      hasCover: Boolean(coverMime),
      hasCoverLandscape: Boolean(coverLandscapeMime),
      hasCoverLandscape2: Boolean(coverLandscape2Mime),
      hasCoverLandscape3: Boolean(coverLandscape3Mime),
    };
  }
}

export type { ContentType };
