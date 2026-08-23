import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CurrentTeam } from '@pugying/core';
import {
  PLATFORM_ACCOUNT_REPOSITORY,
  type IPlatformAccountRepository,
} from '@pugying/platform-account';
import {
  isContentStatus,
  isContentType,
  isContentVisibility,
  type ContentStatus,
  type ContentTargetOverrides,
  type ContentType,
  type ContentVisibility,
} from '@pugying/content/domain/content-types';
import { Content } from '@pugying/content/domain/entities/content.entity';
import { ContentTarget } from '@pugying/content/domain/entities/content-target.entity';
import {
  CONTENT_REPOSITORY,
  type IContentRepository,
} from '@pugying/content/domain/repositories/content.repository';
import {
  CONTENT_TARGET_REPOSITORY,
  type IContentTargetRepository,
} from '@pugying/content/domain/repositories/content-target.repository';
import {
  ContentTargetDto,
  CreateContentDto,
  TargetOverridesDto,
  UpdateContentDto,
} from '@pugying/content/application/dtos';

export type ContentWithTargets = Content & { targets: ContentTarget[] };

@Injectable()
export class ContentService {
  constructor(
    @Inject(CONTENT_REPOSITORY)
    private readonly repository: IContentRepository,
    @Inject(CONTENT_TARGET_REPOSITORY)
    private readonly targetRepository: IContentTargetRepository,
    @Inject(PLATFORM_ACCOUNT_REPOSITORY)
    private readonly platformAccountRepository: IPlatformAccountRepository,
    private readonly currentTeam: CurrentTeam,
  ) {}

  async findAll(
    type?: string,
    q?: string,
  ): Promise<ContentWithTargets[]> {
    if (type !== undefined && type !== '' && !isContentType(type)) {
      throw new BadRequestException(`Unsupported content type: ${type}`);
    }
    const rows = await this.repository.findAllForCurrentTeam({
      type: type && isContentType(type) ? type : undefined,
      q,
    });
    if (rows.length === 0) {
      return [];
    }
    const targets = await this.targetRepository.findByContents(
      rows.map((row) => row.id),
    );
    const grouped = new Map<string, ContentTarget[]>();
    for (const target of targets) {
      const list = grouped.get(target.contentId) ?? [];
      list.push(target);
      grouped.set(target.contentId, list);
    }
    return rows.map((row) =>
      Object.assign(row, { targets: grouped.get(row.id) ?? [] }),
    );
  }

  async findById(id: string): Promise<ContentWithTargets> {
    const content = await this.repository.findById(id);
    if (!content) {
      throw new NotFoundException(`Content #${id} not found`);
    }
    const targets = await this.targetRepository.findByContent(content.id);
    return Object.assign(content, { targets });
  }

  async create(dto: CreateContentDto): Promise<ContentWithTargets> {
    const teamId = this.requireTeamId();
    if (!isContentType(dto.type)) {
      throw new BadRequestException(`Unsupported content type: ${dto.type}`);
    }
    const status: ContentStatus =
      dto.status !== undefined && isContentStatus(dto.status)
        ? dto.status
        : 'draft';
    const visibility: ContentVisibility =
      dto.visibility !== undefined && isContentVisibility(dto.visibility)
        ? dto.visibility
        : 'public';

    const preparedTargets = await this.prepareTargets(teamId, dto.targets);

    const content = this.repository.create({
      teamId,
      type: dto.type,
      title: dto.title.trim(),
      body: dto.body?.trim() || null,
      coverUrl: dto.coverUrl?.trim() || null,
      coverLandscapeUrl: dto.coverLandscapeUrl?.trim() || null,
      mediaUrls: this.normalizeList(dto.mediaUrls),
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
    return Object.assign(saved, { targets });
  }

  async update(id: string, dto: UpdateContentDto): Promise<ContentWithTargets> {
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
    if (dto.coverUrl !== undefined) {
      content.coverUrl = dto.coverUrl.trim() || null;
    }
    if (dto.coverLandscapeUrl !== undefined) {
      content.coverLandscapeUrl = dto.coverLandscapeUrl.trim() || null;
    }
    if (dto.mediaUrls !== undefined) {
      content.mediaUrls = this.normalizeList(dto.mediaUrls);
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
      preparedTargets = await this.prepareTargets(content.teamId, dto.targets);
    }

    const saved = await this.repository.save(content);
    const targets =
      preparedTargets !== undefined
        ? await this.replaceTargets(saved, preparedTargets)
        : await this.targetRepository.findByContent(saved.id);
    return Object.assign(saved, { targets });
  }

  async remove(id: string): Promise<void> {
    const content = await this.repository.findById(id);
    if (!content) {
      throw new NotFoundException(`Content #${id} not found`);
    }
    await this.targetRepository.deleteByContent(content.id);
    await this.repository.remove(content);
  }

  /** 校验账号归属并组装分发目标（不落库） */
  private async prepareTargets(
    teamId: string,
    targets: ContentTargetDto[] | undefined,
  ): Promise<Partial<ContentTarget>[]> {
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
      const account = await this.platformAccountRepository.findById(
        target.platformAccountId,
      );
      if (!account) {
        throw new BadRequestException(
          `Platform account #${target.platformAccountId} not found`,
        );
      }
      prepared.push({
        teamId,
        platformAccountId: account.id,
        platform: account.platform,
        overrides: this.sanitizeOverrides(target.overrides),
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

  private async replaceTargets(
    content: Content,
    prepared: Partial<ContentTarget>[],
  ): Promise<ContentTarget[]> {
    const existing = await this.targetRepository.findByContent(content.id);
    const busy = existing.some(
      (target) =>
        target.publishStatus === 'queued' || target.publishStatus === 'running',
    );
    if (busy) {
      throw new BadRequestException(
        '发布进行中，无法修改分发账号；请等待完成或取消后再试',
      );
    }
    await this.targetRepository.deleteByContent(content.id);
    if (prepared.length === 0) {
      return [];
    }
    const entities = prepared.map((data) =>
      this.targetRepository.create({ ...data, contentId: content.id }),
    );
    return this.targetRepository.saveMany(entities);
  }

  private sanitizeOverrides(
    overrides: TargetOverridesDto | undefined,
  ): ContentTargetOverrides {
    if (!overrides) {
      return {};
    }
    const result: ContentTargetOverrides = {};
    if (overrides.title?.trim()) {
      result.title = overrides.title.trim();
    }
    if (overrides.body?.trim()) {
      result.body = overrides.body.trim();
    }
    if (overrides.coverUrl?.trim()) {
      result.coverUrl = overrides.coverUrl.trim();
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
    if (status === 'published' && content.status !== 'published') {
      content.publishedAt = new Date();
    }
    if (status === 'draft') {
      content.publishedAt = null;
    }
    content.status = status;
  }

  private normalizeList(values: string[] | undefined): string[] {
    return (values ?? [])
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  }

  private requireTeamId(): string {
    if (!this.currentTeam.isAvailable || !this.currentTeam.id) {
      throw new BadRequestException('X-Team-Id is required');
    }
    return this.currentTeam.id;
  }
}

export type { ContentType };
