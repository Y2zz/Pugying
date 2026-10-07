import { ArticleAccountSettingsDto } from './article-account-settings.dto';
import { BilibiliVideoSettingsDto } from './bilibili-video-settings.dto';
import { PlatformResourceRefDto } from './platform-resource-ref.dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { CONTENT_VISIBILITIES } from '../../domain/content-types';
import { AUTHOR_DECLARATIONS, type AuthorDeclaration } from '../../domain/author-declaration';
import { Type } from 'class-transformer';

/** 针对单个账号的差异字段；封面差异走独立 BLOB 接口，不在此 DTO */
export class TargetOverridesDto {
  @ApiPropertyOptional({ type: BilibiliVideoSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BilibiliVideoSettingsDto)
  bilibiliVideoSettings?: BilibiliVideoSettingsDto;
  @ApiPropertyOptional({ type: ArticleAccountSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ArticleAccountSettingsDto)
  articleSettings?: ArticleAccountSettingsDto;

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

  @ApiPropertyOptional({ type: [String], description: '话题标签（差异）' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ type: [PlatformResourceRefDto], description: '平台话题资源（含标识）' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => PlatformResourceRefDto)
  topicRefs?: PlatformResourceRefDto[];

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

  @ApiPropertyOptional({ description: '图文自主声明', enum: AUTHOR_DECLARATIONS })
  @IsOptional()
  @IsIn([...AUTHOR_DECLARATIONS])
  authorDeclaration?: AuthorDeclaration;

  @ApiPropertyOptional({ description: '地点（按账号，如小红书）' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @ApiPropertyOptional({ description: '分区等扩展文案（按账号，如哔哩哔哩）' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  partition?: string;
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
