import { MediaAsset } from '@pugying/content/domain/entities/media-asset.entity';
import type { MediaAssetKind } from '@pugying/content/domain/content-types';

export const MEDIA_ASSET_SORT_FIELDS = [
  'originalName',
  'kind',
  'sizeBytes',
  'createdAt',
] as const;

export type MediaAssetSortField = (typeof MEDIA_ASSET_SORT_FIELDS)[number];
export type MediaAssetSortOrder = 'asc' | 'desc';

export interface MediaAssetListFilter {
  kinds?: MediaAssetKind[];
  q?: string;
  page?: number;
  pageSize?: number;
  sortBy?: MediaAssetSortField;
  sortOrder?: MediaAssetSortOrder;
}

/** 按 kind 聚合的一行（仓储层）；业务层再合并为 video / image */
export interface MediaAssetKindStatsRow {
  kind: MediaAssetKind;
  count: number;
  bytes: number;
}

export interface IMediaAssetRepository {
  create(data: Partial<MediaAsset>): MediaAsset;
  findById(id: string): Promise<MediaAsset | null>;
  /** 签名下载等无团队上下文场景 */
  findByIdUnscoped(id: string): Promise<MediaAsset | null>;
  findPagedForCurrentTeam(
    filter?: MediaAssetListFilter,
  ): Promise<{ rows: MediaAsset[]; total: number }>;
  /** 当前团队库内资产按 kind 汇总（不含软删） */
  findKindStatsForCurrentTeam(): Promise<MediaAssetKindStatsRow[]>;
  findByChecksumForCurrentTeam(
    checksumSha256: string,
    kind?: MediaAssetKind,
  ): Promise<MediaAsset | null>;
  save(asset: MediaAsset): Promise<MediaAsset>;
  softRemove(asset: MediaAsset): Promise<void>;
}

export const MEDIA_ASSET_REPOSITORY = 'IMediaAssetRepository';
