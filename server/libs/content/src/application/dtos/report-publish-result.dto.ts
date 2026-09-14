import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReportPublishResultDto {
  @ApiProperty({ description: '是否发布成功' })
  @IsBoolean()
  ok!: boolean;

  @ApiPropertyOptional({ description: '稳定错误码，如 AUTH_EXPIRED / cancelled' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  errorCode?: string;

  @ApiPropertyOptional({ description: '错误说明' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  errorMessage?: string;

  @ApiPropertyOptional({ description: '平台侧稿件 ID' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  platformPostId?: string;

  @ApiPropertyOptional({ description: '平台侧稿件 URL' })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  platformUrl?: string;
}
