import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import type { BilibiliVideoSettings } from '../../domain/bilibili-video-settings';

export class BilibiliVideoSettingsDto implements BilibiliVideoSettings {
  @ApiProperty({ description: '视频分区' })
  @IsInt()
  @Min(0)
  partitionId: number;

  @ApiProperty({ enum: [1, 2], description: '自制或转载' })
  @IsIn([1, 2])
  copyright: 1 | 2;

  @ApiPropertyOptional({ description: '转载来源' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  source?: string;

  @ApiPropertyOptional({ description: '创作声明' })
  @IsOptional()
  @IsInt()
  @Min(1)
  creationStatementId?: number;
}
