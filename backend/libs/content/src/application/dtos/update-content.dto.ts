import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
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
  CONTENT_VISIBILITIES,
} from '@pugying/content/domain/content-types';
import { ContentTargetDto } from './content-target.dto';

export class UpdateContentDto {
  @ApiPropertyOptional({ description: '标题' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: '正文（图文）/ 简介（视频）' })
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional({ description: '封面图 URL' })
  @IsOptional()
  @IsString()
  coverUrl?: string;

  @ApiPropertyOptional({ type: [String], description: '素材列表' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mediaUrls?: string[];

  @ApiPropertyOptional({ enum: CONTENT_STATUSES })
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

  @ApiPropertyOptional({ enum: CONTENT_VISIBILITIES })
  @IsOptional()
  @IsIn(CONTENT_VISIBILITIES)
  visibility?: string;

  @ApiPropertyOptional({
    description: '定时发布时间（ISO 字符串）；传空字符串表示清除',
  })
  @IsOptional()
  @IsString()
  scheduledAt?: string;

  @ApiPropertyOptional({ description: '是否允许保存/下载' })
  @IsOptional()
  @IsBoolean()
  allowDownload?: boolean;

  @ApiPropertyOptional({
    type: [ContentTargetDto],
    description: '分发目标；提供时整体替换',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContentTargetDto)
  targets?: ContentTargetDto[];
}
