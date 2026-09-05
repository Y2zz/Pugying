import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CONTENT_VISIBILITIES } from '../../domain/content-types';
import { Type } from 'class-transformer';

/** 针对单个账号的差异字段；留空的字段使用内容通用设置 */
export class TargetOverridesDto {
  @ApiPropertyOptional({ description: '标题（差异）' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: '描述/简介（差异）' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  body?: string;

  @ApiPropertyOptional({ description: '竖版封面 URL（差异）' })
  @IsOptional()
  @IsString()
  coverUrl?: string;

  @ApiPropertyOptional({ description: '横版封面 URL（差异）' })
  @IsOptional()
  @IsString()
  coverLandscapeUrl?: string;

  @ApiPropertyOptional({ type: [String], description: '话题标签（差异）' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: '定时发布时间（差异，ISO 字符串）' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional({ description: '可见性（按账号）', enum: CONTENT_VISIBILITIES })
  @IsOptional()
  @IsIn([...CONTENT_VISIBILITIES])
  visibility?: string;

  @ApiPropertyOptional({ description: '是否允许下载（按账号）' })
  @IsOptional()
  @IsBoolean()
  allowDownload?: boolean;
}

export class ContentTargetDto {
  @ApiProperty({ description: '平台账号 UUID' })
  @IsUUID()
  platformAccountId: string;

  @ApiPropertyOptional({ type: TargetOverridesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => TargetOverridesDto)
  overrides?: TargetOverridesDto;
}
