import { ApiProperty } from '@nestjs/swagger';

export class UpdateTenantDto {
  @ApiProperty({ example: '示例公司', required: false, description: '租户名称' })
  name?: string;

  @ApiProperty({ example: true, required: false, description: '是否启用' })
  active?: boolean;
}
