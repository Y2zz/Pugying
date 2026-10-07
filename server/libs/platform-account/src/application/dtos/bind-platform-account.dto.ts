import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CookieDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty()
  @IsString()
  value: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  domain?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  path?: string;

  @ApiPropertyOptional()
  @IsOptional()
  expirationDate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  httpOnly?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  secure?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sameSite?: string;
}

/** Best-effort profile scraped by the Agent; every field may be missing. */
export class PlatformProfileDto {
  @ApiPropertyOptional({ description: '平台侧用户 ID' })
  @IsOptional()
  @IsString()
  platformUserId?: string;

  @ApiPropertyOptional({ description: '平台昵称' })
  @IsOptional()
  @IsString()
  nickname?: string;

  @ApiPropertyOptional({ description: '平台头像地址' })
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @ApiPropertyOptional({
    description: '同一账号的其它平台侧标识（如视频号 uniqId）',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  alternateUserIds?: string[];
}

export class BindPlatformAccountDto {
  @ApiProperty({
    enum: ['douyin', 'toutiao', 'channels', 'bilibili', 'xiaohongshu'],
  })
  @IsString()
  @IsNotEmpty()
  platform: string;

  @ApiPropertyOptional({ description: '展示名称，缺省用平台名' })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional({ description: '平台用户 ID' })
  @IsOptional()
  @IsString()
  platformUserId?: string;

  @ApiProperty({ type: [CookieDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CookieDto)
  cookies: CookieDto[];

  @ApiPropertyOptional({ description: '授权完成时的页面 URL' })
  @IsOptional()
  @IsString()
  finalUrl?: string;

  @ApiPropertyOptional({
    type: PlatformProfileDto,
    description: 'Agent 抓取的平台资料（昵称 / 头像 / 用户 ID）',
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => PlatformProfileDto)
  profile?: PlatformProfileDto;
}

export class ReauthPlatformAccountDto {
  @ApiProperty({ type: [CookieDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CookieDto)
  cookies: CookieDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  platformUserId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  finalUrl?: string;

  @ApiPropertyOptional({ type: PlatformProfileDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => PlatformProfileDto)
  profile?: PlatformProfileDto;
}

/** Manual rename — the fallback when profile scraping came up empty. */
export class RenamePlatformAccountDto {
  @ApiProperty({ example: '我的抖音号' })
  @IsString()
  @IsNotEmpty()
  displayName: string;
}
