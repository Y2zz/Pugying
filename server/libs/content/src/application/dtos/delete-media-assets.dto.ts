import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';

/** 批量软删媒体库资源 */
export class DeleteMediaAssetsDto {
  @ApiProperty({
    type: [String],
    description: '待删除媒体资产 UUID 列表（单次最多 100 个）',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  ids!: string[];
}
