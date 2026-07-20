import { ApiProperty } from '@nestjs/swagger';

export class CreateTenantDto {
  @ApiProperty({ example: '示例公司', description: '租户名称' })
  displayName: string;

  @ApiProperty({ example: 'example-corp', description: '租户标识（唯一）' })
  name: string;
}
