import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateTeamDto {
  @ApiProperty({ example: '示例团队', required: false, description: '团队显示名称' })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiProperty({ example: 'example-team', required: false, description: '团队标识' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ example: true, required: false, description: '是否启用' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
