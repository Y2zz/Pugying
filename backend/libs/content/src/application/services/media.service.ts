import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';
import type { Readable } from 'stream';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CurrentTeam } from '@pugying/core';
import {
  isMediaAssetKind,
  type MediaAssetKind,
} from '@pugying/content/domain/content-types';
import {
  MEDIA_ASSET_REPOSITORY,
  MEDIA_ASSET_SORT_FIELDS,
  type IMediaAssetRepository,
  type MediaAssetSortField,
  type MediaAssetSortOrder,
} from '@pugying/content/domain/repositories/media-asset.repository';
import {
  MEDIA_STORAGE,
  type IMediaStorage,
  type MediaUploadSessionMeta,
} from '@pugying/content/domain/repositories/media-storage';

/** 默认视频上限 1GB；可通过 MEDIA_MAX_VIDEO_BYTES 覆盖 */
export const DEFAULT_MAX_VIDEO_BYTES = 1024 * 1024 * 1024;
export const DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024;
export const DEFAULT_SIGNED_URL_TTL_SEC = 15 * 60;

const VIDEO_MIME = new Set(['video/mp4', 'application/mp4']);
const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * 团队媒体库应用服务（分片上传、去重、签名下载）。
 *
 * 二进制经 `IMediaStorage`（开源默认 `LocalMediaStorage` 本机盘）。
 * 多副本 / 对象存储由商业包覆盖 `MEDIA_STORAGE`；见 docs/media-storage.md。
 */
@Injectable()
export class MediaService {
  private readonly maxVideoBytes: number;
  private readonly signingSecret: string;
  private readonly publicBaseUrl: string;

  constructor(
    @Inject(MEDIA_ASSET_REPOSITORY)
    private readonly assets: IMediaAssetRepository,
    private readonly currentTeam: CurrentTeam,
    @Inject(MEDIA_STORAGE)
    private readonly storage: IMediaStorage,
  ) {
    const maxRaw = Number(process.env.MEDIA_MAX_VIDEO_BYTES);
    this.maxVideoBytes =
      Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : DEFAULT_MAX_VIDEO_BYTES;
    this.signingSecret =
      process.env.MEDIA_SIGNING_SECRET?.trim() ||
      process.env.JWT_SECRET?.trim() ||
      'pugying-dev-secret-change-me';
    this.publicBaseUrl = (
      process.env.MEDIA_PUBLIC_BASE_URL?.trim() ||
      process.env.API_BASE_URL?.trim() ||
      'http://127.0.0.1:3000'
    ).replace(/\/$/, '');
  }

  private requireTeamId(): string {
    if (!this.currentTeam.isAvailable || !this.currentTeam.id) {
      throw new BadRequestException('X-Team-Id is required');
    }
    return this.currentTeam.id;
  }

  private assertKindAndMime(kind: MediaAssetKind, mimeType: string): void {
    if (kind === 'video') {
      if (!VIDEO_MIME.has(mimeType)) {
        throw new BadRequestException(
          '视频仅支持 MP4（Content-Type: video/mp4）',
        );
      }
      return;
    }
    if (!IMAGE_MIME.has(mimeType)) {
      throw new BadRequestException('封面仅支持 JPEG / PNG / WebP');
    }
  }

  private assertSize(kind: MediaAssetKind, sizeBytes: number): void {
    if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) {
      throw new BadRequestException('无效的文件大小');
    }
    if (kind === 'video' && sizeBytes > this.maxVideoBytes) {
      throw new BadRequestException(
        `视频超过上限 ${this.maxVideoBytes} 字节（默认 1GB）`,
      );
    }
    if (kind !== 'video' && sizeBytes > 20 * 1024 * 1024) {
      throw new BadRequestException('封面超过 20MB 上限');
    }
  }

  async initUpload(input: {
    kind: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    chunkSize?: number;
  }): Promise<{
    uploadId: string;
    chunkSize: number;
    chunkCount: number;
  }> {
    const teamId = this.requireTeamId();
    if (!isMediaAssetKind(input.kind)) {
      throw new BadRequestException('无效的媒体类型');
    }
    const mimeType = input.mimeType.trim().toLowerCase();
    this.assertKindAndMime(input.kind, mimeType);
    this.assertSize(input.kind, input.sizeBytes);

    const chunkSize =
      input.chunkSize && input.chunkSize > 0
        ? Math.min(input.chunkSize, 16 * 1024 * 1024)
        : DEFAULT_CHUNK_SIZE;
    const chunkCount = Math.ceil(input.sizeBytes / chunkSize);
    const uploadId = randomUUID();
    const meta: MediaUploadSessionMeta = {
      id: uploadId,
      teamId,
      kind: input.kind,
      originalName: input.originalName.trim() || 'upload.bin',
      mimeType,
      sizeBytes: input.sizeBytes,
      chunkSize,
      chunkCount,
      received: [],
      createdAt: new Date().toISOString(),
    };
    await this.storage.initSession(meta);

    return { uploadId, chunkSize, chunkCount };
  }

  private async readMeta(uploadId: string): Promise<MediaUploadSessionMeta> {
    return this.storage.readSessionMeta(uploadId, this.requireTeamId());
  }

  async putChunk(
    uploadId: string,
    index: number,
    data: Buffer,
  ): Promise<{ received: number; chunkCount: number }> {
    const meta = await this.readMeta(uploadId);
    if (!Number.isInteger(index) || index < 0 || index >= meta.chunkCount) {
      throw new BadRequestException('无效的分片序号');
    }
    const expected =
      index === meta.chunkCount - 1
        ? meta.sizeBytes - meta.chunkSize * (meta.chunkCount - 1)
        : meta.chunkSize;
    if (data.length !== expected) {
      throw new BadRequestException(
        `分片大小不匹配：期望 ${expected}，实际 ${data.length}`,
      );
    }
    await this.storage.putChunk(uploadId, index, data);
    if (!meta.received.includes(index)) {
      meta.received.push(index);
      meta.received.sort((a, b) => {
        return a - b;
      });
      await this.storage.writeSessionMeta(meta);
    }
    return { received: meta.received.length, chunkCount: meta.chunkCount };
  }

  async completeUpload(uploadId: string): Promise<{
    id: string;
    kind: MediaAssetKind;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    url: string;
    checksumSha256: string;
  }> {
    const meta = await this.readMeta(uploadId);
    if (meta.received.length !== meta.chunkCount) {
      throw new BadRequestException(
        `分片未齐：${meta.received.length}/${meta.chunkCount}`,
      );
    }

    const storageKey = `${meta.kind}/${randomUUID()}`;
    const hash = createHash('sha256');
    await this.storage.writeAssetFromSession({
      uploadId,
      teamId: meta.teamId,
      storageKey,
      chunkCount: meta.chunkCount,
      onChunk: (chunk) => {
        hash.update(chunk);
      },
    });

    const checksumSha256 = hash.digest('hex');
    const asset = this.assets.create({
      teamId: meta.teamId,
      kind: meta.kind,
      originalName: meta.originalName,
      mimeType: meta.mimeType,
      sizeBytes: meta.sizeBytes,
      storageKey,
      checksumSha256,
    });
    const saved = await this.assets.save(asset);
    await this.storage.removeSession(uploadId);

    return {
      id: saved.id,
      kind: saved.kind,
      originalName: saved.originalName,
      mimeType: saved.mimeType,
      sizeBytes: saved.sizeBytes,
      url: this.buildAssetApiPath(saved.id),
      checksumSha256,
    };
  }

  /**
   * 按内容指纹查当前团队是否已有相同资源（用于上传前去重提醒）。
   */
  async checkDuplicate(
    kindRaw: string,
    checksumSha256: string,
  ): Promise<{
    duplicate: null | {
      id: string;
      kind: MediaAssetKind;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      url: string;
      checksumSha256: string;
      createdAt: Date;
    };
  }> {
    if (!isMediaAssetKind(kindRaw)) {
      throw new BadRequestException('无效的媒体类型');
    }
    const checksum = checksumSha256.trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(checksum)) {
      throw new BadRequestException('无效的 checksumSha256');
    }
    this.requireTeamId();
    const found = await this.assets.findByChecksumForCurrentTeam(
      checksum,
      kindRaw,
    );
    if (!found) {
      return { duplicate: null };
    }
    return {
      duplicate: {
        id: found.id,
        kind: found.kind,
        originalName: found.originalName,
        mimeType: found.mimeType,
        sizeBytes: found.sizeBytes,
        url: this.buildAssetApiPath(found.id),
        checksumSha256: found.checksumSha256 ?? checksum,
        createdAt: found.createdAt,
      },
    };
  }

  buildAssetApiPath(assetId: string): string {
    return `/media/assets/${assetId}`;
  }

  /**
   * 列出当前团队媒体库资源（分页）。
   * type=video → kind=video；type=image → cover / cover_landscape。
   */
  async listAssets(
    type?: string,
    q?: string,
    page = 1,
    pageSize = 20,
    sortBy: MediaAssetSortField = 'createdAt',
    sortOrder: MediaAssetSortOrder = 'desc',
  ): Promise<{
    items: Array<{
      id: string;
      kind: MediaAssetKind;
      category: 'video' | 'image';
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      url: string;
      createdAt: Date;
      updatedAt: Date;
    }>;
    total: number;
    page: number;
    pageSize: number;
  }> {
    if (!Number.isInteger(page) || page < 1) {
      throw new BadRequestException('page must be a positive integer');
    }
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new BadRequestException('pageSize must be between 1 and 100');
    }
    if (!MEDIA_ASSET_SORT_FIELDS.includes(sortBy)) {
      throw new BadRequestException(
        `sortBy must be one of: ${MEDIA_ASSET_SORT_FIELDS.join(', ')}`,
      );
    }
    if (sortOrder !== 'asc' && sortOrder !== 'desc') {
      throw new BadRequestException('sortOrder must be asc or desc');
    }

    let kinds: MediaAssetKind[] | undefined;
    if (type === 'video') {
      kinds = ['video'];
    } else if (type === 'image') {
      kinds = ['cover', 'cover_landscape'];
    } else if (type !== undefined && type !== '' && type !== 'all') {
      throw new BadRequestException(
        `Unsupported media type filter: ${type}（支持 video / image / all）`,
      );
    }

    const { rows, total } = await this.assets.findPagedForCurrentTeam({
      kinds,
      q,
      page,
      pageSize,
      sortBy,
      sortOrder,
    });
    const items = rows.map((asset) => {
      const category: 'video' | 'image' =
        asset.kind === 'video' ? 'video' : 'image';
      return {
        id: asset.id,
        kind: asset.kind,
        category,
        originalName: asset.originalName,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
        url: this.buildAssetApiPath(asset.id),
        createdAt: asset.createdAt,
        updatedAt: asset.updatedAt,
      };
    });
    return { items, total, page, pageSize };
  }

  /**
   * 团队媒体库汇总：库内未软删资产的字节与数量（不含磁盘临时分片）。
   */
  async getLibraryStats(): Promise<{
    totalCount: number;
    totalBytes: number;
    byCategory: {
      video: { count: number; bytes: number };
      image: { count: number; bytes: number };
    };
  }> {
    const rows = await this.assets.findKindStatsForCurrentTeam();
    const video = { count: 0, bytes: 0 };
    const image = { count: 0, bytes: 0 };
    for (const row of rows) {
      if (row.kind === 'video') {
        video.count += row.count;
        video.bytes += row.bytes;
      } else {
        image.count += row.count;
        image.bytes += row.bytes;
      }
    }
    return {
      totalCount: video.count + image.count,
      totalBytes: video.bytes + image.bytes,
      byCategory: { video, image },
    };
  }

  async removeAsset(id: string): Promise<void> {
    const asset = await this.assets.findById(id);
    if (!asset) {
      throw new NotFoundException('资源不存在');
    }
    await this.assets.softRemove(asset);
  }

  /** 批量软删；跳过当前团队库中不存在的 id，全部缺失时 404 */
  async removeAssets(ids: string[]): Promise<{
    deletedIds: string[];
    missingIds: string[];
  }> {
    const uniqueIds = [...new Set(ids)];
    const deletedIds: string[] = [];
    const missingIds: string[] = [];

    for (const id of uniqueIds) {
      const asset = await this.assets.findById(id);
      if (!asset) {
        missingIds.push(id);
        continue;
      }
      await this.assets.softRemove(asset);
      deletedIds.push(id);
    }

    if (deletedIds.length === 0) {
      throw new NotFoundException('资源不存在');
    }

    return { deletedIds, missingIds };
  }

  async createSignedDownloadUrlForTeam(
    assetId: string,
    ttlSec = DEFAULT_SIGNED_URL_TTL_SEC,
  ): Promise<{ url: string; expiresAt: number }> {
    const asset = await this.assets.findById(assetId);
    if (!asset) {
      throw new NotFoundException('资源不存在');
    }
    return this.createSignedDownloadUrl(asset.id, ttlSec);
  }

  createSignedDownloadUrl(
    assetId: string,
    ttlSec = DEFAULT_SIGNED_URL_TTL_SEC,
  ): { url: string; expiresAt: number } {
    const exp = Math.floor(Date.now() / 1000) + ttlSec;
    const sig = this.sign(assetId, exp);
    const url = `${this.publicBaseUrl}/media/assets/${assetId}/download?exp=${exp}&sig=${encodeURIComponent(sig)}`;
    return { url, expiresAt: exp };
  }

  private sign(assetId: string, exp: number): string {
    return createHmac('sha256', this.signingSecret)
      .update(`${assetId}.${exp}`)
      .digest('hex');
  }

  private verifySig(assetId: string, exp: number, sig: string): boolean {
    const expected = this.sign(assetId, exp);
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(sig, 'utf8');
    if (a.length !== b.length) {
      return false;
    }
    return timingSafeEqual(a, b);
  }

  async openSignedDownload(
    assetId: string,
    expRaw: string,
    sig: string,
  ): Promise<{
    stream: Readable;
    mimeType: string;
    sizeBytes: number;
    originalName: string;
  }> {
    const exp = Number(expRaw);
    if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('签名已过期');
    }
    if (!sig || !this.verifySig(assetId, exp, sig)) {
      throw new UnauthorizedException('无效签名');
    }

    const asset = await this.assets.findByIdUnscoped(assetId);
    if (!asset || asset.deletedAt) {
      throw new NotFoundException('资源不存在');
    }

    const { stream } = await this.storage.openAsset(
      asset.teamId,
      asset.storageKey,
    );
    return {
      stream,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      originalName: asset.originalName,
    };
  }

  /** 清理超过 maxAgeMs 的未完成分片会话（轻量孤儿回收） */
  async scrubStaleUploads(maxAgeMs = 24 * 60 * 60 * 1000): Promise<number> {
    return this.storage.scrubStaleSessions(maxAgeMs);
  }
}
