import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SoftDeleteAuditedEntity } from '@pugying/core';
import type {
  ContentStatus,
  ContentType,
  ContentVisibility,
} from '@pugying/content/domain/content-types';

export class Content extends SoftDeleteAuditedEntity {

  @ApiProperty({ enum: ['article', 'video'], description: '内容类型' })
  type: ContentType;

  @ApiProperty({ example: '我的第一篇图文', description: '标题' })
  title: string;

  @ApiPropertyOptional({ description: '正文（图文）/ 简介（视频）' })
  body: string | null;

  /** 竖封面 MIME；字节见 coverData，列表 API 不返回字节 */
  coverMime: string | null;

  /** 竖封面二进制（3:4）；列表/详情默认不序列化 */
  coverData: Buffer | null;

  /** 横封面 MIME */
  coverLandscapeMime: string | null;

  /** 横封面二进制（4:3） */
  coverLandscapeData: Buffer | null;

  @ApiProperty({
    type: [String],
    description: '本机绝对路径：图文为图片，视频为视频文件（通常 1 个）',
  })
  mediaPaths: string[];

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
