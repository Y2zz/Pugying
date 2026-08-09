import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SoftDeleteAuditedEntity, type IMultiTeam } from '@pugying/core';
import type { MediaAssetKind } from '@pugying/content/domain/content-types';

/** 团队库媒体资产：视频 / 竖封面 / 横封面（原样存储，无转码） */
export class MediaAsset extends SoftDeleteAuditedEntity implements IMultiTeam {
  @ApiProperty({ description: '所属团队 UUID' })
  teamId: string;

  @ApiProperty({
    enum: ['video', 'cover', 'cover_landscape'],
    description: '资产类型',
  })
  kind: MediaAssetKind;

  @ApiProperty({ description: '原始文件名' })
  originalName: string;

  @ApiProperty({ description: 'MIME 类型' })
  mimeType: string;

  @ApiProperty({ description: '字节大小' })
  sizeBytes: number;

  @ApiProperty({ description: '相对存储键（团队内路径）' })
  storageKey: string;

  @ApiPropertyOptional({ description: '可选内容校验和' })
  checksumSha256: string | null;
}
