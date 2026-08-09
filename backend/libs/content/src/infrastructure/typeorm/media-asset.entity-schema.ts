import { EntitySchema } from 'typeorm';
import { MediaAsset } from '@pugying/content/domain/entities/media-asset.entity';

export const MediaAssetEntitySchema = new EntitySchema<MediaAsset>({
  name: 'MediaAsset',
  tableName: 'media_asset',
  target: MediaAsset,
  columns: {
    id: {
      type: 'uuid',
      primary: true,
      generated: 'uuid',
    },
    teamId: {
      type: 'uuid',
    },
    kind: {
      type: String,
    },
    originalName: {
      type: String,
    },
    mimeType: {
      type: String,
    },
    sizeBytes: {
      type: 'integer',
    },
    storageKey: {
      type: String,
    },
    checksumSha256: {
      type: String,
      nullable: true,
    },
    createdAt: {
      type: Date,
      createDate: true,
    },
    updatedAt: {
      type: Date,
      updateDate: true,
    },
    deletedAt: {
      type: Date,
      deleteDate: true,
      nullable: true,
    },
  },
  indices: [
    {
      name: 'IDX_media_asset_team_kind',
      columns: ['teamId', 'kind'],
    },
    {
      name: 'IDX_media_asset_team_checksum',
      columns: ['teamId', 'checksumSha256'],
    },
  ],
});
