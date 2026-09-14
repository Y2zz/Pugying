import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  CONTENT_STATUSES,
  CONTENT_TYPES,
  CONTENT_VISIBILITIES,
} from '@pugying/content/domain/content-types';
import { ContentTargetDto } from './content-target.dto';

export class CreateContentDto {
  @ApiProperty({ enum: CONTENT_TYPES, description: '内容类型' })
  @IsIn(CONTENT_TYPES)
  type: string;

  @ApiProperty({ description: '标题' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({ description: '正文（图文）/ 简介（视频）' })
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional({ description: '竖版封面 URL（3:4）' })
  @IsOptional()
  @IsString()
  coverUrl?: string;

  @ApiPropertyOptional({ description: '横版封面 URL（16:9；抖音等平台必填）' })
  @IsOptional()
  @IsString()
  coverLandscapeUrl?: string;

  @ApiPropertyOptional({
    type: [String],
    description: '素材列表：图文为图片 URL，视频为本机媒体库视频地址',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mediaUrls?: string[];

  @ApiPropertyOptional({ enum: CONTENT_STATUSES, default: 'draft' })
  @IsOptional()
  @IsIn(CONTENT_STATUSES)
  status?: string;

  @ApiPropertyOptional({ type: [String], description: '话题标签（不含 #）' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: '位置（POI）' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  location?: string;

  @ApiPropertyOptional({ enum: CONTENT_VISIBILITIES, default: 'public' })
  @IsOptional()
  @IsIn(CONTENT_VISIBILITIES)
  visibility?: string;

  @ApiPropertyOptional({ description: '定时发布时间（ISO 字符串）' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional({ description: '是否允许保存/下载', default: true })
  @IsOptional()
  @IsBoolean()
  allowDownload?: boolean;

  @ApiPropertyOptional({
    type: [ContentTargetDto],
    description: '分发目标：平台账号 + 差异字段',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContentTargetDto)
  targets?: ContentTargetDto[];
}
