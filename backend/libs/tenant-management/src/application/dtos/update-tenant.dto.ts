import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateTenantDto {
  @ApiProperty({ example: '示例公司', required: false, description: '租户显示名称' })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiProperty({ example: 'example-corp', required: false, description: '租户标识' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ example: true, required: false, description: '是否启用' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
