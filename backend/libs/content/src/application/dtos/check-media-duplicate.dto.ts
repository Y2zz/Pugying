import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { MEDIA_ASSET_KINDS } from '@pugying/content/domain/content-types';

export class CheckMediaDuplicateDto {
  @ApiProperty({ enum: MEDIA_ASSET_KINDS })
  @IsIn([...MEDIA_ASSET_KINDS])
  kind!: string;

  @ApiProperty({
    description: '文件内容 SHA-256（小写 hex，64 位）',
    example: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  })
  @IsString()
  @MinLength(64)
  @MaxLength(64)
  @Matches(/^[a-f0-9]{64}$/)
  checksumSha256!: string;
}
