import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SoftDeleteAuditedEntity } from '@pugying/core';
import type {
  PlatformAccountStatus,
  PlatformId,
} from '@pugying/platform-account/domain/platform-catalog';

export class PlatformAccount extends SoftDeleteAuditedEntity {

  @ApiProperty({
    enum: ['douyin', 'toutiao', 'channels', 'bilibili', 'xiaohongshu'],
    description: '平台标识',
  })
  platform: PlatformId;

  @ApiProperty({ example: '我的抖音号', description: '展示名称' })
  displayName: string;

  @ApiPropertyOptional({ description: '平台侧用户 ID（可空）' })
  platformUserId: string | null;

  @ApiPropertyOptional({ description: '平台头像地址（可空）' })
  avatarUrl: string | null;

  /** Encrypted cookie payload — never expose via list DTOs. */
  credentialCipher: string;

  @ApiProperty({
    enum: ['active', 'expired', 'revoked'],
    description: '账号状态',
  })
  status: PlatformAccountStatus;

  @ApiPropertyOptional({ description: '最近授权时间' })
  lastAuthedAt: Date | null;
}
