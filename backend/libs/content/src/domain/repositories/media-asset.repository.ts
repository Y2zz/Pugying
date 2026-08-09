import { MediaAsset } from '@pugying/content/domain/entities/media-asset.entity';
import type { MediaAssetKind } from '@pugying/content/domain/content-types';

export interface IMediaAssetRepository {
  create(data: Partial<MediaAsset>): MediaAsset;
  findById(id: string): Promise<MediaAsset | null>;
  /** 签名下载等无团队上下文场景 */
  findByIdUnscoped(id: string): Promise<MediaAsset | null>;
  findAllForCurrentTeam(kinds?: MediaAssetKind[]): Promise<MediaAsset[]>;
  findByChecksumForCurrentTeam(
    checksumSha256: string,
    kind?: MediaAssetKind,
  ): Promise<MediaAsset | null>;
  save(asset: MediaAsset): Promise<MediaAsset>;
  softRemove(asset: MediaAsset): Promise<void>;
}

export const MEDIA_ASSET_REPOSITORY = 'IMediaAssetRepository';
