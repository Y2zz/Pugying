import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { MEDIA_ASSET_KINDS } from '@pugying/content/domain/content-types';

export class InitMediaUploadDto {
  @ApiProperty({ enum: MEDIA_ASSET_KINDS })
  @IsIn([...MEDIA_ASSET_KINDS])
  kind!: string;

  @ApiProperty({ example: 'clip.mp4' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  originalName!: string;

  @ApiProperty({ example: 'video/mp4' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  mimeType!: string;

  @ApiProperty({ description: '总字节数' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sizeBytes!: number;

  @ApiPropertyOptional({ description: '分片大小，默认约 8MB，最大 16MB' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(64 * 1024)
  @Max(16 * 1024 * 1024)
  chunkSize?: number;
}
