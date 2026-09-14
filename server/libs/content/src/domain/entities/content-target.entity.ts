import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AuditedEntity } from '@pugying/core';
import type {
  ContentTargetOverrides,
  TargetPublishStatus,
} from '@pugying/content/domain/content-types';

/** 内容的分发目标：一个平台账号 + 针对该账号的差异字段 + 发布运行态 */
export class ContentTarget extends AuditedEntity {

  @ApiProperty({ description: '内容 UUID' })
  contentId: string;

  @ApiProperty({ description: '平台账号 UUID' })
  platformAccountId: string;

  @ApiProperty({ description: '平台标识（冗余自平台账号，便于查询）' })
  platform: string;

  @ApiProperty({ description: '差异字段；未设置的字段使用内容通用设置' })
  overrides: ContentTargetOverrides;

  @ApiProperty({
    enum: ['idle', 'queued', 'running', 'succeeded', 'failed', 'cancelled'],
    description: '对该账号的发布运行态',
  })
  publishStatus: TargetPublishStatus;

  @ApiPropertyOptional({ description: '平台侧稿件 ID' })
  platformPostId: string | null;

  @ApiPropertyOptional({ description: '平台侧稿件 URL' })
  platformUrl: string | null;

  @ApiPropertyOptional({ description: '稳定错误码，如 AUTH_EXPIRED' })
  errorCode: string | null;

  @ApiPropertyOptional({ description: '错误说明（可展示给用户）' })
  errorMessage: string | null;

  @ApiPropertyOptional({ description: '开始执行时间' })
  startedAt: Date | null;

  @ApiPropertyOptional({ description: '结束时间（成功/失败/取消）' })
  finishedAt: Date | null;
}
