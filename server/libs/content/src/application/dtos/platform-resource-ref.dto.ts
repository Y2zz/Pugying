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
