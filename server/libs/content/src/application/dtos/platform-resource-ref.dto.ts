import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

/** 平台资源引用 DTO；id 须为数字字符串（含 "0" 未绑定文本话题）。 */
export class PlatformResourceRefDto {
  @ApiProperty({ description: '平台资源标识' })
  @IsString()
  @Matches(/^\d+$/)
  @MaxLength(64)
  id: string;

  @ApiProperty({ description: '展示名称（不含 #）' })
  @IsString()
  @MaxLength(80)
  @Matches(/^[^\s#]+$/)
  name: string;
}

/**
 * 已绑定的合集/文集等资源：名称可含空格，id 不能为 0。
 * 与话题 DTO 分开，避免放宽话题名校验。
 */
export class BoundPlatformResourceRefDto {
  @ApiProperty({ description: '平台资源标识（已绑定）' })
  @IsString()
  @Matches(/^[1-9]\d*$/)
  @MaxLength(64)
  id: string;

  @ApiProperty({ description: '展示名称（可含空格，不含 #）' })
  @IsString()
  @MaxLength(80)
  @Matches(/^[^#]+$/)
  name: string;
}
