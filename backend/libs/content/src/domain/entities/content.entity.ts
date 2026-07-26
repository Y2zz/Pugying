import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SoftDeleteAuditedEntity, type IMultiTeam } from '@pugying/core';
import type {
  ContentStatus,
  ContentType,
  ContentVisibility,
} from '@pugying/content/domain/content-types';

export class Content extends SoftDeleteAuditedEntity implements IMultiTeam {
  @ApiProperty({ description: '所属团队 UUID' })
  teamId: string;

  @ApiProperty({ enum: ['article', 'video'], description: '内容类型' })
  type: ContentType;

  @ApiProperty({ example: '我的第一篇图文', description: '标题' })
  title: string;

  @ApiPropertyOptional({ description: '正文（图文）/ 简介（视频）' })
  body: string | null;

  @ApiPropertyOptional({ description: '封面图 URL' })
  coverUrl: string | null;

  @ApiProperty({
    type: [String],
    description: '素材列表：图文为图片 URL，视频为视频 URL',
  })
  mediaUrls: string[];

  @ApiProperty({ enum: ['draft', 'published'], description: '内容状态' })
  status: ContentStatus;

  @ApiPropertyOptional({ description: '发布时间' })
  publishedAt: Date | null;

  @ApiProperty({ type: [String], description: '话题标签（不含 # 前缀）' })
  tags: string[];

  @ApiPropertyOptional({ description: '位置（POI）' })
  location: string | null;

  @ApiProperty({
    enum: ['public', 'friends', 'private'],
    description: '谁可以看',
  })
  visibility: ContentVisibility;

  @ApiPropertyOptional({ description: '定时发布时间；null 表示立即发布' })
  scheduledAt: Date | null;

  @ApiProperty({ description: '是否允许保存/下载' })
  allowDownload: boolean;
}
